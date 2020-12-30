const crypto = require('crypto');
const Readable = require('stream').Readable;
const fs = require('fs');
const {app} = require('electron').remote;

let config = {};
let currentFile = {};

const userDataPath = app.getPath('userData');
const defaultSalt = '1462788bcad59f4b6f9f0caefc754d8d';
const configFilePath = userDataPath + '/config.json';

function encrypt(text, key=config['auth_info']['pass_hash']) {
    let iv = crypto.randomBytes(16);
    let cipher = crypto.createCipheriv('aes-256-ctr', Buffer.from(key, 'hex'), iv);
    let encrypted = cipher.update(text);

    encrypted = Buffer.concat([encrypted, cipher.final()]);

    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text, key=config['auth_info']['pass_hash']) {
    let textParts = text.split(':');
    let iv = Buffer.from(textParts.shift(), 'hex');
    let encryptedText = Buffer.from(textParts.join(':'), 'hex');
    let decipher = crypto.createDecipheriv('aes-256-ctr', Buffer.from(key, 'hex'), iv);
    let decrypted = decipher.update(encryptedText);

    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

// Read config file from default path, set global config variable,
// and return JSON object representing config file
function readConfigFileAsJson() {
    let configFileRaw = fs.readFileSync(userDataPath + '/config.json');
    let configFile = JSON.parse(configFileRaw);

    config = configFile; // Set global config variable to parsed json obj
    return configFile;
}

// Write global config obj to config file
function writeToConfigFileFromJson(configFile=config) {
    let configFileRaw = fs.writeFileSync(configFilePath, JSON.stringify(configFile));
}

function createAuthInfo(password, salt=defaultSalt) {
    let key = crypto.scryptSync(password, salt, 32);

    config['auth_info'] = {
        'pass_salt': salt,
        'pass_hash': key.toString('hex')
    };

    writeToConfigFileFromJson();
}

function chooseFileToEncrypt(dirPath, fileName) {
    let iv = crypto.randomBytes(16);

    currentFile['dirPath'] = dirPath;
    currentFile['fileName'] = fileName;
    currentFile['iv'] = iv.toString('hex');
}

function encryptFileToDiskFromString(text, dirPath=currentFile['dirPath'], fileName=currentFile['fileName']) {
    // console.log(text.replaceAll(new RegExp('src="file:\/\/\/.*?\\"', "g"), 'src=""'));
    fs.writeFileSync(dirPath + '/' + fileName, encrypt(text.replaceAll(new RegExp('src="data:image.*?\\"', "g"), 'src=""')));
}

function decryptFile(filePath) {
    filePath = filePath;

    // Make sure file exists before trying to decrypt file
    if (fs.existsSync(filePath)) {
        const encString = fs.readFileSync(filePath).toString();
        return decrypt(encString);
    } else {
        return "";
    }
}

// Run startup script to check and load config file
function startupConfigInit() {
    // Check if config file exists on system
    if (!fs.existsSync(configFilePath)) {
        // Config file doesn't exist
        console.log("Creating config file");

        // Prompt user to enter a new password
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
module.exports = {chooseFileToEncrypt, encryptFileToDiskFromString, decryptFile, encrypt, decrypt};