const fs = require('fs');
const {app} = require('electron').remote;
global.logger = require('pino')()
const path = require('path');
var EditorFile = require('../modules/File')

const encryption = require('../modules/encryption');
const folderStructure = require('../modules/folder-structure');
const config = require('../modules/config');

const Sync = require('../modules/sync');
const sync = new Sync();
if (sync.instance !== undefined) {
    // Show sync button on editor page
    $('#btn-sync').show();
} else {
    $('#btn-sync').hide();
}

const signupDiv = document.getElementById('startup-signup');
const appDiv = document.getElementById('app-container');
const fileNameInput = $('#input-file-name');

const userDataPath = app.getPath('userData') + "/user/files";
const assetsPath = app.getPath('userData') + "/user/assets";

const fileNameRegex = /^[a-zA-Z0-9_@()-/\s]+$/;

let currentFile = undefined;

var quill;
let writing = false;

function initQuill() {
    hljs.configure({   // optionally configure hljs
        languages: ['javascript', 'python', 'html']
    });
    // Fixed error with image local src not passing sanitization
    var Image = Quill.import('formats/image');
    Image.sanitize = function(url) {
        return url;
    };

    // Add 'alt' value to image (used for encrypting the image locally and storing the local path)
    class CustomImage extends Image {
        static create(data) {
            let fileName = '';
            if (data !== '') {
                //const fileExt = data.split(',')[0].split('/')[1].split(';')[0];
                fileName = encryption.encryptName(`${require('uuid').v4()}`)

                fs.writeFile(`${assetsPath}/${fileName}`, encryption.encrypt(data.toString('base64')), function(err) {
                    if (err) {
                        console.log(err);
                    }
                });
            }

            const node = super.create(data);
            node.setAttribute('src', data);
            node.setAttribute('alt', fileName);

            return node;

        }
    }
    Quill.register(CustomImage, true);

    var toolbarOptions = [
        ['bold', 'italic', 'underline', 'strike'],        // toggled buttons
        ['blockquote', 'code-block'],

        [{ 'header': 1 }, { 'header': 2 }],               // custom button values
        [{ 'list': 'ordered'}, { 'list': 'bullet' }, { 'list': 'check' }],
        [{ 'script': 'sub'}, { 'script': 'super' }],      // superscript/subscript
        [{ 'indent': '-1'}, { 'indent': '+1' }],          // outdent/indent
        [{ 'direction': 'rtl' }],                         // text direction
        [ 'link'],

        [{ 'header': [1, 2, 3, 4, 5, 6, false] }],

        [{ 'color': [] }, { 'background': [] }],          // dropdown with defaults from theme
        [{ 'align': [] }],

        ['clean']                                         // remove formatting button
    ];

    quill = new Quill('#editor', {
        modules: {
            syntax: true,
            imageResize: {
                displaySize: true
            },
            imageDrop: true,
            toolbar: toolbarOptions
        },
        placeholder: 'Choose file to start writing...',
        theme: 'snow'
    })
    quill.enable(false);
}
initQuill();

const editor = document.querySelector('.ql-editor');

// Remove extra backslashes in path
function cleanPath(path) {
    return path.replace(/([^:]\/)\/+/g, "$1").replaceAll('///', '/').replaceAll('//', '/');
}

// Handle new folder creation from modal
function newFolderModalHandler(parentPath, folderName) {
    folderStructure.createNewFolder(parentPath + '/' + encryption.encryptName(folderName))
    document.getElementById('input-new-folder-name').value = '';
    $('#modal-new-folder').modal('hide');
}

function newFileModalHandler(folderPath, fileName) {
    createNewDocument(folderPath + '/' + encryption.encryptName(fileName), () => {
        document.getElementById('input-new-file-name').value = '';
        $('#modal-new-file').modal('hide');
    })
}

function renameFile(filePath, newName) {
    // #TODO: Make sure newName will not conflict with any existing files in the specified directory

    let encRelPath = filePath.replace(userDataPath, '');
    let decRelPath = encryption.decryptPath(encRelPath);
    let completePath = path.normalize(`${userDataPath}/${filePath}`);
    let newNameEnc = encryption.encryptName(newName);

    // Remove the file name from the relative path of the current file location
    let parentFolderArr = filePath.split('/')
    parentFolderArr.pop()

    let newCompPath = path.normalize(`${userDataPath}/${parentFolderArr.join('/')}/${newNameEnc}`);

    if (fileNameRegex.test(newName) === false) return console.log(`Renaming file failed: Invalid new name used when renaming file.`)
    if (folderStructure.checkIfFileExists(filePath)) return console.log(`Renaming file failed: User tried renaming file to a name of a file that already exists.`)

    fs.rename(completePath, newCompPath, (err) => {
        if (err) logger.error(err)
        else {
            logger.info(`Successfully renamed file in local directory`)

            // Get new decrypted relative file path
            let newDecRelPath = decRelPath.split('/');
            newDecRelPath[newDecRelPath.length - 1] = newName;
            newDecRelPath = newDecRelPath.join('/');

            Object.defineProperty(folderStructure.files, newDecRelPath, Object.getOwnPropertyDescriptor(folderStructure.files, decRelPath));
            delete folderStructure.files[decRelPath];

            directoryHandler.updateGUIFileMenuItem(completePath.replace(userDataPath, ''), newCompPath.replace(userDataPath, ''))
            openFile(newCompPath.replace(userDataPath, ''), false, true)
            if (sync.instance !== undefined) {
                sync.instance.renameItem('file', decRelPath, newNameEnc)
            }
        }
    })
}

/*
* Reset the file name display and the change name listener
 */
function resetEditNameInput() {
    fileNameInput.val(''); // Reset file name to an empty string

    // Reset change listener for renaming a file
    fileNameInput.off('change').change(function() {
        console.log("Please open a file before trying to rename it.")
    })
}

function resetEditor() {
    resetEditNameInput()
    writing = false;
    quill.enable(false);
    this.quill['emitter']['_events']['text-change'] = undefined;

    quill.setContents([]);
    currentFile = undefined;
}

/*
* Delete the current file from local and cloud storage, also removing it from the menu bar.
 */
function deleteCurrentFile() {
    console.log(`Deleting file ${currentFile.getFullPath()}`)

    writing = false;
    quill.enable(false);
    this.quill['emitter']['_events']['text-change'] = undefined;
    
    // Delete file from file tracking object
    const relDecPath = currentFile.getRelativePath(true)
    delete folderStructure.files[relDecPath]

    fs.unlink(currentFile.getFullPath(), (err) => {
        if (err) throw(err)
        else {
            console.log("Deleted file from local storage")
            $(`div[data-path="${currentFile.getRelativePath()}"]`).remove();
            console.log("Deleted file option from menu builder")
            sync.instance.deleteFileFromDrive(encryption.decryptPath(currentFile.getRelativePath()));
            resetEditor();
        }
    })
}

/*
* Delete a folder, and all recursively stored items, remove folder from GUI, and refresh directory structure tracking obj
* @param    String  Relative or Absolute path of folder
 */
function deleteFolder(path) {
    const relPath = path.replace(userDataPath, '');
    const decRelPath = encryption.decryptPath(relPath);
    fs.rmdir(cleanPath(`${userDataPath}/${relPath}`), {recursive: true}, (err) => {
        if (err) throw err;
        else {
            // Check if the currently open file exists in the folder that is being deleted
            if (currentFile !== undefined && currentFile.getRelativePath().contains(relPath)) {
                resetEditor();
            }

            // Update file/folder structure tracking object to count for deleted files and all recursively stored items
            folderStructure.getDirStructure()

            // Remove folder from GUI
            $(`div[data-path="${relPath}"]`).remove();
            sync.instance.deleteFolderFromDrive(decRelPath);
        }
    })
}

function userAuth() {
    if (input_password.value === input_confPassword.value) {
        const saveConfig = document.getElementById('checkbox-save-config').checked;
        encryption.createAuthInfo(input_password.value, saveConfig);

        signupDiv.style.display = 'none';
        appDiv.style.display = 'block';

        // Build file menu now that user has signed in
        folderStructure.buildFileMenu();
    }
}

// Start-up script
function startupConfigInit() {
    // Check if config file exists on system
    if (!config['config']['auth_info']) {
        // Config file doesn't contain authentication information, ask user to signup/signin
        signupDiv.style.display = 'block';
    } else {
        // Config file already exists on system
        appDiv.style.display = 'block';
        // Only build file menu if config file is present, else wait for user
        // to sign in before building file menu
        folderStructure.buildFileMenu();
    }
}

startupConfigInit();

async function importPhotosToFile() {
    const currImgs = Array.from(quill.container.firstChild.getElementsByTagName("img"));

    // Find all images, decrypt, and store as base64
    for (let i = 0; i < currImgs.length; i++) {
        try {
            encryption.decryptFileAsync(cleanPath(`${assetsPath}/${currImgs[i].getAttribute('alt')}`), (data) => {
                currImgs[i].setAttribute('src', data);
            })
            // currImgs[i].setAttribute('src', encryption.decryptFile(cleanPath(`${assetsPath}/${currImgs[i].getAttribute('alt')}`)));
        } catch (e) {
            console.log(e);
        }
    }
}

function updateEditorFromLocalFile(filePath) {
    try {
        // Decrypt the quill operations from local file
        let decOps = encryption.decryptFile(filePath)
        quill.setContents(JSON.parse(decOps))
        logger.info('Updated editor content from local file')
    } catch(e) {
        logger.error(`Error updating editor from local file: Incorrect key used for decryption or error occurred.`)
        quill.clipboard.dangerouslyPasteHTML('Incorrect key used for decryption or error occurred.', 'api');
    }
    importPhotosToFile();
}

function imageHandler(delta, oldDelta) {
    let currrentContents = quill.getContents();
    let diff = currrentContents.diff(oldDelta);

    const currImgs = Array.from(quill.container.firstChild.getElementsByTagName("img"));
    const currImgsSrc = []

    // Confirm image deletion
    currImgs.forEach(img => {
        currImgsSrc.push(img.alt);
    })

    for (let i = 0; i < diff.ops.length; i++) {
        if (diff.ops[i].hasOwnProperty('attributes') && diff.ops[i]['attributes']['alt']) {
            // Image has been deleted
            const imgPath = diff.ops[i]['attributes']['alt'];

            if (!currImgsSrc.includes(imgPath)) {
                // Delete image locally
                fs.unlink(cleanPath(`${assetsPath}/${imgPath}`), (err) => {
                    if (err) throw err;
                    console.log('Image deleted from local folder');
                });
            }
        }
    }
}

function initSaveFile(filePath) {
    if (document) {
        this.quill.on('text-change', (delta, oldDelta, source) => {
            if (!writing) {
                writing = true;
                imageHandler(delta, oldDelta, source);
                encryption.encryptQuillOpsToDisk(quill.getContents().ops, filePath, function() {writing=false})
            }
        });
    }
}

function openFile(dirPath, newFile=false, renamedFile=false) {
    writing = true;
    quill.enable(false);
    // Resent on text-change event if one exists
    this.quill['emitter']['_events']['text-change'] = undefined;

    currentFile = new EditorFile(cleanPath(userDataPath + "/" + dirPath));

    if (!renamedFile) {
        if (newFile === false) {
            // Check if file exists locally
            if (!fs.existsSync(currentFile.getFullPath())){
                console.log("Opening file failed: File doesn't exist locally.")
            } else {
                updateEditorFromLocalFile(currentFile.getFullPath())
            }
        } else {
            // Empty quill editor for new file
            quill.setContents([])
        }
    }

    // Set file name for editor
    fileNameInput.val(encryption.decryptName(`${currentFile.getFileName()}`));
    fileNameInput.off('change').change(function() {
        renameFile(dirPath, fileNameInput.val())
    })

    // Enable editor to allow user interaction
    quill.enable(true);
    initSaveFile(currentFile.getFullPath());
    writing = false;
    console.log("finished opening file")
}

async function createNewDocument(dirPath, callback) {
    dirPath = cleanPath(dirPath)
    currentFile = new EditorFile(cleanPath(userDataPath + "/" + dirPath));

    if (folderStructure.checkIfFileExists(encryption.decryptPath(dirPath))) {
        console.log("Failed creating new file: File already exists!");
        callback();
    } else {
        await encryption.encryptQuillOpsToDisk([], currentFile.getFullPath(), () => {
            openFile(dirPath, true);
            folderStructure.buildFileMenu();
            callback();
        })
    }
}

/*
* Event handlers
 */

// Main '+' button event handler
// Assists in creating a new file or folder at the root directory
document.getElementById('btn-main-add').addEventListener('click', function(e) {
    document.getElementById('add-new-folder').onclick = function() {
        document.getElementById('btn-create-new-folder').onclick = function() {
            let folderName = document.getElementById('input-new-folder-name').value;
            newFolderModalHandler('/', folderName)
        }
        $('#modal-new-folder').modal('show');
    }
    document.getElementById('add-new-file').onclick = function() {
        document.getElementById('btn-create-new-file').onclick = function() {
            let fileName = document.getElementById('input-new-file-name').value;
            newFileModalHandler('/', fileName)
        }
        $('#modal-new-file').modal('show');
    }

    // Places the dropdown at mouse tip
    $('.context-menu').css({
        left: e.pageX,
        top: e.pageY
    });

    // Hide menu if it's already visible
    $('.context-menu').hide();
    // Show menu
    $('.context-menu').slideDown(300);

    // Prevent default action
    return false;
});

const input_password = document.getElementById('input-password');
const input_confPassword = document.getElementById('input-confirm-password');
const label_wrongPassword = document.getElementById('lbl-wrong-pass');
const label_saltGenBytes = document.getElementById('lbl-gen-salt-bytes');
const input_salt = document.getElementById('input-salt');
const input_confSalt = document.getElementById('input-confirm-salt');

// Password input confirmation script
// Checks if password and password confirmation inputs are equal
input_confPassword.addEventListener('keyup', function() {
    if (input_password.value === input_confPassword.value) {
        label_wrongPassword.style.display = 'none';
    } else {
        label_wrongPassword.style.display = 'inline';
    }
})

// Generate random salt button
document.getElementById('btn-gen-salt').addEventListener('click', function() {
    $('#input-salt').val(encryption.randomSalt(8));
    $('#div-gen-rand-salt').show();
})

// Random salt generator slider handler
document.getElementById('input-gen-salt').addEventListener('input', function() {
    input_salt.value = encryption.randomSalt(parseInt(slider_saltGen.value));
    label_saltGenBytes.textContent = 'Bytes: ' + parseInt(slider_saltGen.value);
})

// Hide folder menu if user clicks outside of the 'new file' or 'new folder' menu
$(document).on('click', function (e) {
    if (!($(e.target).closest(".btn-hidden-folder-menu").length === 1)) {
        $("#list-folder-menu").hide();
    }
});

// Override default action upon form submission
$("#form-signup").submit(function(e) {
    e.preventDefault();
});

const settingsSignInBtn = $('#div-cloud-sign-in');
const settingsSignOutBtn = $('#div-cloud-sign-out');
// Settings button modal handler
$('#btn-settings').on('click', function(e) {
    e.preventDefault();
    $('#modal-settings').modal('show');

    settingsSignInBtn.hide();
    settingsSignOutBtn.hide();

    // Set if user should have option to sign in or sign out from cloud provider
    if (sync.instance === undefined) {
        settingsSignInBtn.show();
    } else {
        settingsSignOutBtn.show();
    }
})

// Show config and folder paths for users computer
document.getElementById('config-file-location').innerHTML = app.getPath('userData') + '/config.json';
document.getElementById('file-storage-location').innerHTML = app.getPath('userData') + '/user/files';
document.getElementById('asset-storage-location').innerHTML = app.getPath('userData') + '/user/assets';

$('#btn-cloud-sign-in').on('click', function(e) {
    const signInSpinner = $('#cloud-sign-in-spinner');
    signInSpinner.show()
    sync.initDrive(() => {
        settingsSignInBtn.hide(); // Hide sign in button
        signInSpinner.hide(); // Hide spinner
        settingsSignOutBtn.show(); // Show sign out button
        $('#btn-sync').show(); // Show sync button on editor page
    });
})

$('#btn-sync').on('click', (e) => {
    this.quill['emitter']['_events']['text-change'] = undefined; // Clear on change file save listener
    quill.enable(false); // Disable editor
    sync.instance.sync().then(() => {
        console.log('Finished sync');
        // Reopen file if a user was editing a file when sync was initiated
        if (currentFile !== undefined) {
            openFile(currentFile.getRelativePath());
        }
    })
})

$('#btn-delete-note').on('click', (e) => {
    if (currentFile === undefined) {
        console.log("No file is opened to be deleted");
        return;
    }
    deleteCurrentFile();
})