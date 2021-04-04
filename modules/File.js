const userDataPath = app.getPath('userData') + "/user/files";
const encryption = require('../modules/encryption');


module.exports = class EditorFile {
    constructor(fullPath) {
        this.fullPath = fullPath;
        this.name = fullPath.split("/")[fullPath.split("/").length - 1];
        this.relativePath = fullPath.replace(userDataPath, '');
    }

    getFileName(decrypt=false) {
        if (decrypt === true) return encryption.decryptPath(this.name)
        return this.name
    }

    getFullPath(decrypt=false) {
        if (decrypt === true) return encryption.decryptPath(this.fullPath)
        return this.fullPath
    }

    getRelativePath(decrypt=false) {
        if (decrypt === true) return encryption.decryptPath(this.relativePath)
        return this.relativePath
    }
}
