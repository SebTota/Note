const config = require('../modules/config');
const fs = require('fs');
const {app} = require('electron').remote;
global.logger = require('pino')()

const encryption = require('../modules/encryption');
const folderStructure = require('../modules/folder-structure');

const signupDiv = document.getElementById('startup-signup');
const appDiv = document.getElementById('app-container');

const fileNameRegex = /^[a-zA-Z0-9_@()-/\s]+$/;

const sync = {
    'syncName': '',
    'syncProvider': '',
    'obj': undefined
}

const currentFile = {
    'dirPath': '',
    'filePath': '',
    'relativePath': '',
    'fileName': ''
};

//const googleAuth = require('../modules/providers/google-auth.js')
function authGoogle() {
    sync.syncName = 'drive';
    sync.syncProvider = 'gdrive';
    // sync.obj = new googleAuth(sync.syncName);
}

const userDataPath = app.getPath('userData') + "/user/files";
const assetsPath = app.getPath('userData') + "/user/assets";

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
    return path.replace(/([^:]\/)\/+/g, "$1").replaceAll('//', '/');
}

// Handle new folder creation from modal
function newFolderModalHandler(parentPath, folderName) {
    if (createNewFolder(parentPath + '/' + encryption.encryptName(folderName))) {
        folderStructure.buildFileMenu();
    } else {
        console.log('Creating new folder failed. Folder might already exist');
    }
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
    console.log(newName)
    filePath = cleanPath(filePath.replace(userDataPath, ''));
    newName = cleanPath(newName);

    if (fileNameRegex.test(newName) === false) {
        logger.warn(`Renaming file failed: Invalid new name used when renaming file.`)
        return;
    }

    if (folderStructure.checkIfFileExists(filePath)) {
        logger.warn(`Renaming file failed: User tried renaming file to a name of a file that already exists.`)
        return;
    }

    // Create a copy of the current complete path the file is located at
    let oldPath = cleanPath(`${userDataPath}/${filePath}`)

    // Remove the file name from the relative path of the current file location
    let pathArr = filePath.split('/')
    pathArr.pop()

    // Create a complete path of where the new file will be located
    let parentFolderPath = cleanPath(`${userDataPath}/${pathArr.join('/')}`)

    let newPath = cleanPath(`${parentFolderPath}/${encryption.encryptName(newName)}`)

    fs.rename(oldPath, newPath, (err) => {
        if (err) logger.error(err)
        else {
            logger.info(`Successfully renamed file in local directory`)
            directoryHandler.updateGUIFileMenuItem(oldPath.replace(userDataPath, ''), newPath.replace(userDataPath, ''))
            openFile(newPath.replace(userDataPath, ''), false, true)
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

    currentFile['relativePath'] = dirPath;
    currentFile['fileName'] = dirPath.split("/")[dirPath.split("/").length - 1];
    currentFile['filePath'] = cleanPath(userDataPath + "/" + dirPath);

    if (!renamedFile) {
        if (newFile === false) {
            // Check if file exists locally
            if (!fs.existsSync(currentFile['filePath'])){
                console.log("Opening file failed: File doesn't exist locally.")
            } else {
                updateEditorFromLocalFile(currentFile['filePath'])
            }
        } else {
            // Empty quill editor for new file
            quill.setContents([])
        }
    }

    // Set file name for editor
    $('#input-file-name').val(encryption.decryptName(`${currentFile['fileName']}`));
    $('#input-file-name').off('change').change(function() {
        renameFile(dirPath, $('#input-file-name').val())
    })

    // Enable editor to allow user interaction
    quill.enable(true);
    initSaveFile(currentFile['filePath']);
    writing = false;
    console.log("finished opening file")
}

function createNewFolder(relativePath) {
    // Check if directory already exists
    if (fs.existsSync(userDataPath + "/" + relativePath)){
        console.log("Failed creating new folder. Folder already exists!")
        return false;
    } else {
        fs.mkdirSync(userDataPath + "/" + relativePath);
        console.log("New folder created!");
        return true
    }

}

async function createNewDocument(dirPath, callback) {
    dirPath = cleanPath(dirPath)
    currentFile['relativePath'] = dirPath;
    currentFile['fileName'] = cleanPath(dirPath.split("/")[dirPath.split("/").length - 1]);
    currentFile['filePath'] = cleanPath(userDataPath + "/" + dirPath);

    if (folderStructure.checkIfFileExists(encryption.decryptPath(dirPath))) {
        console.log("Failed creating new file: File already exists!");
        callback();
    } else {
        encryption.encryptQuillOpsToDisk([], currentFile['filePath'], () => {
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
const slider_saltGen = document.getElementById('input-gen-salt');

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
slider_saltGen.addEventListener('input', function() {
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