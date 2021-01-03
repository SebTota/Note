const crypto = require('crypto');
const Readable = require('stream').Readable;
const fs = require('fs');
const {app} = require('electron').remote;
const dirTree = require("directory-tree");
let writing = false;

const defaultSalt = '1462788bcad59f4b6f9f0caefc754d8d';
const userDataPath = app.getPath('userData') + "/user/files";
const configFilePath = app.getPath('userData') + '/user/config.json';

const config = {
    'auth_info': {
        'pass_salt': '',
        'key': ''
    }
};

let currentFile = {

};

let dirStructure = {};

// Read local config file
function readConfigFileAsJson() {
    let configFileRaw = fs.readFileSync(configFilePath);
    let configFile = JSON.parse(configFileRaw);

    // Update config variable with updates values
    config['auth_info']['pass_salt'] = configFile['auth_info']['pass_salt'];
    config['auth_info']['key'] = configFile['auth_info']['key'];

    return configFile;
}

// Save config file locally
function writeToConfigFileFromJson(configFile=config) {
    let configFileRaw = fs.writeFileSync(configFilePath, JSON.stringify(configFile));
}

// Create key from user password and salt
// If no salt is specified, the default salt is used
function createAuthInfo(password, salt=defaultSalt) {
    let key = crypto.scryptSync(password, salt, 32);

    config['auth_info']['pass_salt'] = salt;
    config['auth_info']['key'] = key.toString('hex');

    // Update local config file
    writeToConfigFileFromJson();
}

function buildDirectoryStructure(baseDir="/") {
    dirStructure = dirTree(userDataPath + baseDir, { extensions: /\.(txt|html|enc)$/});
}

// Start-up script
// Load local config file if one exists, or create a new one if it doesn't
function startupConfigInit() {
    // Check if config file exists on system
    if (!fs.existsSync(configFilePath)) {
        // Config file doesn't exist
        console.log("Creating config file");

        let tempPass = "test123"; // Temporary password
        createAuthInfo(tempPass);
    } else {
        // Config file already exists on system
        console.log("Reading config file");

        // Read exisiting configuration file
        readConfigFileAsJson();
    }
}

function checkIfFile(obj) {
    for (let i = 0; i < obj['children'].length; i++) {
        if ((obj['children'][i]['type'] === 'file' && obj['children'][i]['name'].replace('.enc', '') === obj['name']) ||
            (obj['children'][i]['name'] === 'assets')
        ){
            return obj['name']
        }
    }
    return false
}

function createMenuFolderButton(obj, padding) {
    let folderDiv = document.createElement('div');
    folderDiv.classList.add('div-folder')

    let folderSvgNode = document.createElement('img');
    folderSvgNode.classList.add('folder-svg');
    folderSvgNode.src = 'assets/folder-fill.svg';

    let menuNodeContainer = document.createElement('div');
    menuNodeContainer.height = '100%';
    menuNodeContainer.width = '100%';

    let menuDiv = document.createElement('div');
    menuDiv.classList.add('div-menu-folder');
    menuDiv.classList.add('btn-group');
    menuDiv.classList.add('dropright');

    let menuButton = document.createElement('button');
    menuButton.textContent = obj['name'];
    menuButton.classList.add('btn-dir-menu-folder');
    menuButton.style.paddingLeft = padding + 'px';
    menuButton.addEventListener('click', function() {
        $(this).parent().siblings().toggle();
    })
    menuDiv.appendChild(menuButton);

    // Create + button to add new file/folder in folder
    let hiddenMenu = document.createElement('button');
    hiddenMenu.classList.add('btn-hidden-folder-menu');
    hiddenMenu.addEventListener('click', function(e) {

        document.getElementById('add-new-folder').onclick = function() {
            document.getElementById('btn-create-new-folder').onclick = function() {
                let folderName = document.getElementById('input-new-folder-name').value;
                newFolderModalHandler(obj['path'].replace(userDataPath, ''), folderName)
            }
            $('#modal-new-folder').modal('show');
        }

        document.getElementById('add-new-file').onclick = function() {
            document.getElementById('btn-create-new-file').onclick = function() {
                let fileName = document.getElementById('input-new-file-name').value;
                newFileModalHandler(obj['path'].replace(userDataPath, ''), fileName)
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

    let hiddenMenuPlus = document.createElement('img');
    hiddenMenuPlus.classList.add('add-svg');
    hiddenMenuPlus.src = 'assets/plus-circle.svg';

    hiddenMenu.appendChild(hiddenMenuPlus);
    menuDiv.appendChild(hiddenMenu);

    menuButton.prepend(folderSvgNode);
    folderDiv.appendChild(menuNodeContainer.appendChild(menuDiv));

    return folderDiv
}

function createMenuFileButton(obj, padding) {
    let fileSvgNode = document.createElement('img');
    fileSvgNode.style.paddingLeft = '5px';
    fileSvgNode.style.paddingRight = '5px';
    fileSvgNode.src = 'assets/file-earmark-text.svg';

    let fileNode = document.createElement('div');
    fileNode.style.width = '100%';
    fileNode.style.height = '35px';

    let fileButton = document.createElement('button');
    fileButton.textContent = obj['name'];
    fileButton.classList.add('btn-dir-menu-file');
    fileButton.classList.add('btn');
    fileButton.classList.add('btn-light');
    fileButton.style.paddingLeft = padding + 'px';
    fileButton.addEventListener('click', function() {
        openFile(obj['path'].replace(userDataPath, ''));
    })

    fileButton.prepend(fileSvgNode);
    fileNode.appendChild(fileButton)

    return fileNode
}

function buildFileMenuHelper(obj, padding) {
    let menuNode = createMenuFolderButton(obj, padding)
    padding += 20; // Indent becuase it's one folder deaper

    // Add all folders in directory
    for (let i = 0; i < obj['children'].length; i++) {
        if (checkIfFile(obj['children'][i]) === false) {
            menuNode.appendChild(buildFileMenuHelper(obj['children'][i], padding))
        }
    }

    // Add all files in directory
    for (let i = 0; i < obj['children'].length; i++) {
        if (checkIfFile(obj['children'][i]) !== false) {
            menuNode.appendChild(createMenuFileButton(obj['children'][i], padding));
        }
    }

    return menuNode;
}

function buildFileMenu() {
    // Update folder structure
    buildDirectoryStructure();

    // let menuNode = document.createElement('ul');
    let menuNode = document.createElement('div');

    // Add all folders in current directory
    for (let i = 0; i < dirStructure['children'].length; i++) {
        if (checkIfFile(dirStructure['children'][i]) === false) {
            menuNode.appendChild(buildFileMenuHelper(dirStructure['children'][i], 0))
        }
    }

    // Add all files in current directory
    for (let i = 0; i < dirStructure['children'].length; i++) {
        if (checkIfFile(dirStructure['children'][i]) !== false) {
            menuNode.appendChild(createMenuFileButton(dirStructure['children'][i], 0));
        }
    }

    $('#folders').empty(); // Clear current folder structure menu
    document.getElementById('folders').appendChild(menuNode); // Add newly created menu
    console.log('Built folder structure menu.')
}

// Clear the new folder modal inputs
function clearModals() {
    document.getElementById('input-new-folder-name').value = '';
    document.getElementById('input-new-file-name').value = '';
}

// Handle new folder creation from modal
function newFolderModalHandler(parentPath, folderName) {
    if (newFolder(parentPath + '/' + folderName)) {
        buildFileMenu();
    } else {
        console.log('Creating new folder failed. Folder might already exist');
    }
    $('#modal-new-folder').modal('hide');
}

function newFileModalHandler(folderPath, fileName) {
    newFile(folderPath + '/' + fileName)
    buildFileMenu();
    $('#modal-new-file').modal('hide');
}

function mainAddBtnEventHandler() {
    document.getElementById('btn-main-add').addEventListener('click', function(e) {

        console.log('btn clicked');

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
}

mainAddBtnEventHandler()
startupConfigInit();
buildFileMenu()