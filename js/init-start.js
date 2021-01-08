const signupDiv = document.getElementById('startup-signup');
const appDiv = document.getElementById('app-container');
const input_password = document.getElementById('input-password');
const input_confPassword = document.getElementById('input-confirm-password');
const lable_wrongPassword = document.getElementById('lbl-wrong-pass');
const lable_saltGenBytes = document.getElementById('lbl-gen-salt-bytes');
const input_salt = document.getElementById('input-salt');
const input_confSalt = document.getElementById('input-confirm-salt');
const slider_saltGen = document.getElementById('input-gen-salt');

const EncryptedTextWrongFormatError = { name: 'DecryptionFailed', message: 'Incorrect format used in encrypted text. Missing parameteres.'}
const IncorrectDecryptionKeyError = { name: 'DecryptionFailed', message: 'Wrong key used for decryption'}
const MissingFileError = { name: 'MissingFile', message: 'File not found' }

const fileExtensions = ['json', 'txt', 'html']

const crypto = require('crypto');
const Readable = require('stream').Readable;
const fs = require('fs');
const {app} = require('electron').remote;
const dirTree = require("directory-tree");
let writing = false;

const defaultSalt = 'FGJ4i8rVn0tvnwyu/HVNjQ==';
const scryptCost = Math.pow(2, 16);  // N
const scryptBlockSize = 8;  // r
const scryptParall = 1;  // p
const scryptMem = 128 * scryptParall * scryptBlockSize + 128 * (2 + scryptCost) * scryptBlockSize;

const userDataPath = app.getPath('userData') + "/user/files";
const configFilePath = app.getPath('userData') + '/user/config.json';

const config = {
    'auth_info': {
        'pass_salt': '',
        'key': ''
    }
};

const currentFile = {
    'dirPath': '',
    'filePath': '',
    'relativePath': '',
    'fileName': ''
};

let dirStructure = {};
