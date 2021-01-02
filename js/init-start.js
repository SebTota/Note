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
        if (obj['children'][i]['type'] === 'file' && obj['children'][i]['name'].replace('.enc', '') === obj['name']) {
            return obj['name']
        }
    }
    return false
}

function createMenuFolderButton(obj, padding) {
    let menuNodeContainer = document.createElement('div');
    menuNodeContainer.height = '100%';
    menuNodeContainer.width = '100%';

    let menuNode = document.createElement('div');
    menuNode.style.width = '100%';
    menuNode.style.height = '35px';

    let menuButton = document.createElement('button');
    menuButton.textContent = obj['name'];
    menuButton.classList.add('btn-dir-menu-folder')
    menuButton.style.paddingLeft = padding + 'px';

    menuNodeContainer.appendChild(menuNode.appendChild(menuButton));

    return menuNodeContainer
}

function createMenuFileButton(obj, padding) {
    let fileNode = document.createElement('div');
    fileNode.style.width = '100%';
    fileNode.style.height = '35px';

    let fileButton = document.createElement('button');
    fileButton.textContent = obj['name'];
    fileButton.classList.add('btn-dir-menu-file');
    fileButton.style.paddingLeft = padding + 'px';
    fileButton.addEventListener('click', function() {
        openFile(obj['path'].replace(userDataPath, ''));
    })

    fileNode.appendChild(fileButton)

    return fileNode
}

function buildFileMenuHelper(obj, padding) {
    let menuNode = createMenuFolderButton(obj, padding)
    padding += 20;

    for (let i = 0; i < obj['children'].length; i++) {
        if (checkIfFile(obj['children'][i]) === false) {
            padding += 20;
            menuNode.appendChild(buildFileMenuHelper(obj['children'][i], padding))
        }
    }

    for (let i = 0; i < obj['children'].length; i++) {
        if (checkIfFile(obj['children'][i]) !== false) {
            menuNode.appendChild(createMenuFileButton(obj['children'][i], padding));
        }
    }

    return menuNode;
}

function buildFileMenu() {
    // let menuNode = document.createElement('ul');
    let menuNode = document.createElement('div');

    for (let i = 0; i < dirStructure['children'].length; i++) {
        if (checkIfFile(dirStructure['children'][i]) === false) {
            menuNode.appendChild(buildFileMenuHelper(dirStructure['children'][i], 0))
        }
    }

    for (let i = 0; i < dirStructure['children'].length; i++) {
        if (checkIfFile(dirStructure['children'][i]) !== false) {
            menuNode.appendChild(createMenuFileButton(dirStructure['children'][i], 0));
        }
    }

    console.log(menuNode);
    document.getElementById('folders').appendChild(menuNode);
}


startupConfigInit();
buildDirectoryStructure();
console.log(dirStructure);
buildFileMenu()