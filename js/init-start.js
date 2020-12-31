const crypto = require('crypto');
const Readable = require('stream').Readable;
const fs = require('fs');
const {app} = require('electron').remote;

const defaultSalt = '1462788bcad59f4b6f9f0caefc754d8d';
const userDataPath = app.getPath('userData') + "/user/files";
const configFilePath = app.getPath('userData') + '/user/config.json';

const config = {
    'auth_info': {
        'pass_salt': '',
        'key': ''
    }
};

const currentFile = {

};

const dirStructure = {
    "/": []
};

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

// Map the folder structure of all files in the notebook
function buildDirectoryStructure(baseDir = "/") {
    fs.readdirSync(userDataPath).forEach(file => {
        if (fs.lstatSync(userDataPath + baseDir + file).isFile()) {
            // Add file to current directory
            dirStructure[baseDir].push(baseDir + file);
        } else if(fs.lstatSync(userDataPath +  baseDir + file).isDirectory()) {
            // Recursively search the directory
            dirStructure[baseDir] = [];
            buildDirectoryStructure(baseDir += file + "/");
            baseDir = baseDir.substr(0, baseDir.lastIndexOf("\\")); // remove everything after the last backslash
        }
    });
}

// Start-up script
/*
* Load local config file if one exists, or create a new one if it doesn't
 */
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

startupConfigInit();