const userDataPath = app.getPath('userData') + "/user/files";


module.exports = class EditorFile {
    constructor(fullPath) {
        this.fullPath = fullPath;
        this.name = fullPath.split("/")[fullPath.split("/").length - 1];
        this.relativePath = fullPath.replace(userDataPath, '');
    }

    getFileName() {
        return this.name
    }

    getFullPath() {
        return this.fullPath
    }

    getRelativePath() {
        return this.relativePath
    }
}
