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

const fileExtensions = ['json', 'txt', 'html']

const crypto = require('crypto');
const Readable = require('stream').Readable;
const fs = require('fs');
const {app} = require('electron').remote;
const dirTree = require("directory-tree");



const userDataPath = app.getPath('userData') + "/user/files";
const assetsPath = app.getPath('userData') + "/user/assets";

const currentFile = {
    'dirPath': '',
    'filePath': '',
    'relativePath': '',
    'fileName': ''
};

function authGoogle() {
    const googleAuth = require('../modules/providers/google-auth.js')
    googleAuth.authorize()
    require("electron").shell.openExternal('http://localhost:3000/google-launch-auth');
}