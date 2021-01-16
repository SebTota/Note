const config = require('../modules/config');
const fs = require('fs');
const {app} = require('electron').remote;

const encryption = require('../modules/encryption');
const folderStructure = require('../modules/folder-structure');

const signupDiv = document.getElementById('startup-signup');
const appDiv = document.getElementById('app-container');

const currentFile = {
    'dirPath': '',
    'filePath': '',
    'relativePath': '',
    'fileName': ''
};

function authGoogle() {
    const googleAuth = require('../modules/providers/google-auth.js')
    googleAuth.authorize()
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
    return path.replace(/([^:]\/)\/+/g, "$1");
}

// Clear the new folder modal inputs
function clearModals() {
    document.getElementById('input-new-folder-name').value = '';
    document.getElementById('input-new-file-name').value = '';
}

// Handle new folder creation from modal
function newFolderModalHandler(parentPath, folderName) {
    if (createNewFolder(parentPath + '/' + encryption.encryptName(folderName))) {
        folderStructure.buildFileMenu();
    } else {
        console.log('Creating new folder failed. Folder might already exist');
    }
    $('#modal-new-folder').modal('hide');
}

function newFileModalHandler(folderPath, fileName) {
    createNewDocument(folderPath + '/' + encryption.encryptName(fileName))
    folderStructure.buildFileMenu();
    $('#modal-new-file').modal('hide');
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
    if (!config.readLocalConfigFile()) {
        // Config file doesn't exist, ask user to signup/signin
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

function updateEditorFromLocalFile(filePath) {
    try {
        let decStr = encryption.decryptFile(filePath);
        quill.clipboard.dangerouslyPasteHTML(decStr, 'api');
    } catch(e) {
        console.log(e);
        quill.clipboard.dangerouslyPasteHTML('Incorrect key used for decryption.', 'api');
        return false
    }

    const currImgs = Array.from(quill.container.firstChild.getElementsByTagName("img"));

    // Find all images, decrypt, and store as base64
    for (let i = 0; i < currImgs.length; i++) {
        try {
            currImgs[i].setAttribute('src', encryption.decryptFile(cleanPath(`${assetsPath}/${currImgs[i].getAttribute('alt')}`)));
        } catch (e) {
            console.log(e);
        }
    }

    return true
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
                encryption.encryptFileToDiskFromString(editor.innerHTML, filePath, function() {writing=false})
            }
        });
    }
}

function openFile(dirPath, newFile=false) {
    quill.enable(false);
    // Resent on text-change event if one exists
    this.quill['emitter']['_events']['text-change'] = undefined;

    currentFile['relativePath'] = dirPath;
    currentFile['fileName'] = dirPath.split("/")[dirPath.split("/").length - 1];
    currentFile['filePath'] = cleanPath(userDataPath + "/" + dirPath);

    if (newFile === false) {
        // Check if file exists locally
        if (!fs.existsSync(currentFile['filePath'])){
            console.log("Opening file failed: File doesn't exist locally.")
        } else {
            updateEditorFromLocalFile(currentFile['filePath'])
        }
    }
    $('#input-file-name').val(encryption.decryptName(`${currentFile['fileName']}`));
    quill.enable(true);
    initSaveFile(currentFile['filePath']);
    return true;
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

function createNewDocument(dirPath) {
    currentFile['relativePath'] = dirPath;
    currentFile['fileName'] = dirPath.split("/")[dirPath.split("/").length - 1];
    currentFile['filePath'] = cleanPath(userDataPath + "/" + dirPath);

    if (fs.existsSync(currentFile['filePath'])) {
        console.log("Failed creating new file: File already exists! Trying to open existing file.");
        openFile(dirPath);
        return
    }

    encryption.encryptFileToDiskFromStringSync('', currentFile['filePath']);
    openFile(dirPath, true);
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