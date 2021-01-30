const express = require('express')
const https = require('https')
const {google} = require('googleapis');
const encryption = require('../encryption');
const config = require('../config');
const folderStructure = require('../folder-structure');

const userDataPath = app.getPath('userData') + "/user/files";

const googleBaseUrl = 'https://accounts.google.com/o/oauth2/v2/auth?';
const googleClientId = '604030377902-ks4fj8c1ru62c3i1rivtfj19grpsnnc5.apps.googleusercontent.com';
const googleEncryptedClientSecret = 'ijly3K50taNrIcwB/HZLwA==hEZ2J8UJFI2XObzecQpXpg==V/08xX++ZxwjUXjwkqVuNSJbdb2KuR9h';
const googleScope = 'https://www.googleapis.com/auth/drive';
const googleRedirectUrl = 'http://127.0.0.1:3000/google-authorized';
const googleResponseType = 'code';
const driveHomeFolder = '_NOTE_';

const googleMimeFolder = 'application/vnd.google-apps.folder';

module.exports = class GoogleAuth {
    constructor(name) {
        this.oAuth2Client = undefined;
        this.drive = undefined;
        this.driveName = '';
        this.authenticate(name);

        this.files = {};
        this.folders = {};
    }

    getAllItems() {
        return {'files': this.files, 'folders': this.folders}
    }

    // Create a temporary local server to host Google OAuth process
    // Need to create a local server to serve these files because Google doesn't support OAuth on "file://"
    startAuthServer(clientId = googleClientId, callback) {
        const app = express()

        app.get('/google-launch-auth', (req, res) => {
            // Create OAuth redirect URL based on app data (client id)
            const redirectUrl = `${googleBaseUrl}access_type=offline&client_id=${clientId}&redirect_uri=${googleRedirectUrl}&response_type=${googleResponseType}&scope=${googleScope}`

            // Redirect users to Google OAuth login
            res.send(`<html><body><script>window.location.href='${redirectUrl}'</script></body></html>`)
        })

        // Listen for authorization token to be returned from OAuth process
        app.get('/google-authorized', (req, res) => {
            res.send('You are logged in. You can now close this page and go back to the application.');
            const code = req.query.code;
            server.close()
            callback(code)
        })

        // Start listening on specified port
        const server = app.listen(3000)
    }

    authenticate(driveName, forceNew=false, clientId=googleClientId, clientSecret=encryption.show(googleEncryptedClientSecret)) {
        this.oAuth2Client = new google.auth.OAuth2(
            clientId, clientSecret, googleRedirectUrl);

        // Check if we have previously stored a token.
        if (!forceNew && config.getValue(`${driveName}.token`)) {
            this.oAuth2Client.setCredentials(JSON.parse(encryption.show(config.getValue(`${driveName}.token`))));
            const auth = this.oAuth2Client
            this.drive = google.drive({version: 'v3', auth});
        } else {
            this.startAuthServer(clientId,(code) => {
                this.getAccessToken(driveName, code);
            })
            require("electron").shell.openExternal('http://localhost:3000/google-launch-auth');
        }
    }

    getAccessToken(driveName, code) {
        this.oAuth2Client.getToken(code, (err, token) => {
            if (err) return console.error('Error retrieving access token', err);
            this.oAuth2Client.setCredentials(token);
            const auth = this.oAuth2Client
            this.drive = google.drive({version: 'v3', auth});
            this.driveName = driveName;

            config.setValue(`${driveName}`, {}, true);
            config.setValue(`${driveName}.token`, encryption.hide(JSON.stringify(token)), true);
        });
    }

    async listItems(itemType='all', parent='root', folderPath='/') {
        if (!(itemType === 'file' || itemType === 'folder' || itemType === 'all')) {
            throw {'name': 'Invalid object type', 'message': 'Error: Choose "file", "folder", "all" as file type'}
        }

        const drive = this.drive

        // Build search criteria
        let qVal = '';

        // Filter by object type (file/folder) if specified
        if (itemType !== 'all') { qVal += `mimeType = 'application/vnd.google-apps.${itemType}' and` }

        qVal += `'${parent}' in parents and trashed = false`

        await drive.files.list({
            pageSize: 100,
            q: qVal,
            fields: 'nextPageToken, files',
        }, (err, res) => {
            if (err) { logger.error(`Error getting files from gdrive: ${err}`); }
            const files = res.data.files;
            if (files.length) {
                files.map((file) => {
                    if (file.name !== '.DS_Store') {
                        if (file.mimeType === googleMimeFolder) {
                            this.folders[encryption.decryptPath(folderPath + file.name)] = `${folderPath + file.name}`
                            this.listItems(itemType, file.id, `${folderPath + file.name}/`)
                        } else {
                            this.files[encryption.decryptPath(folderPath + file.name)] =
                                {
                                    'name': folderPath + file.name,
                                    'id': file.id,
                                    'mtime': file.modifiedTime
                                };
                        }
                    }
                });
            } else {
                console.log('No files found.');
            }
        });
    }

    async getItemId(itemType, itemName, itemPath, parent = 'root') {
        if (typeof(itemName) !== 'string') { return }
        if (!(itemType === 'file' || itemType === 'folder')) {
            throw {'name': 'Invalid object type', 'message': 'Error: Choose "file" or "folder" as file type'}
        }

        let name = itemName

        let qVal = '';
        let mime = `application/vnd.google-apps.${itemType}`;
        qVal += `mimeType = '${mime}' and name = '${name}' and '${parent}' in parents and trashed = false`

        const drive = this.drive
        await drive.files.list({
            q: qVal,
            pageSize: 10,
            fields: 'nextPageToken, files',
        }, (err, res) => {
            if (err) return console.log('The API returned an error: ' + err);
            const files = res.data.files;
            if (files.length) {
                console.log('Files:');
                files.map((file) => {
                    console.log(file.id);
                });
            } else {
                console.log('No files found.');
            }
        });
    }

    createNewCloudFolder(folderPath) {
        let folders = folderPath.split('/')
        let folderName = folders.pop()

        const drive = this.drive
        var fileMetadata = {
            'name': folderName,
            'mimeType': 'application/vnd.google-apps.folder',
            'keepRevisionForever': true
        };
        drive.files.create({
            resource: fileMetadata
        }, function (err, file) {
            if (err) {
                console.error(err);
            } else {
                console.log(file)
            }
        });
    }

    syncFolders() {
        for (let key in this.folders) {
            if (this.folders.hasOwnProperty(key)) {
                if (!folderStructure.folders.hasOwnProperty(key)) {
                    /*
                    * This will cause some collisions since the local folders dictionary doesn't get updated
                    * as we add new folders. This should not cause any issues because createNewFolder()
                    * checks if the folder exists before creating the new folder.
                    * Ex. If the path is '/test/folder1' and '/test' exists but '/folder1' doesn't
                    * we need to check if 'test' exists first because we are using probabilistic encryption
                    * to encrypt the entire path meaning the '/test' folder will have a different names.
                     */

                    let foldersInPath = key.split('/');
                    if (foldersInPath[0] === '') foldersInPath.shift(); // Remove "" from folder paths (root folder which always exists!)

                    let subFolderPath = ''; // Holds the path of which folders in the path already exist locally
                    let numFolders = foldersInPath.length;
                    for (let i = 0; i < numFolders; i++) {
                        let tempPath = `${subFolderPath}/${foldersInPath[0]}`;
                        tempPath = tempPath.replaceAll('///', '/').replaceAll('//', '/');

                        if (folderStructure.folders.hasOwnProperty(tempPath)) {
                            subFolderPath = tempPath;
                            foldersInPath.shift()
                        } else {
                            break
                        }
                    }

                    let folderPath = '';
                    if (subFolderPath !== '') {
                        folderPath = `/${folderStructure.folders[subFolderPath]}/${encryption.encryptPath(foldersInPath.join('/'))}`;
                    } else {
                        folderPath = `/${encryption.encryptPath(foldersInPath.join('/'))}`;
                    }
                    folderPath = folderPath.replaceAll('///', '/').replaceAll('//', '/');

                    logger.info(`Creating a new folder at path: ${folderPath}`)
                    folderStructure.createNewFolder(folderPath);
                }
            }
        }
    }

    syncFileFromDrive(fileId, filePath) {
        filePath.replace(userDataPath, '');
        filePath = `${userDataPath}/${filePath}`;
        filePath.replaceAll('///', '/').replaceAll('//', '/');
        logger.info(`Google Auth - Sync file from drive: Syncing file to path: ${filePath}`);

        this.drive.files
            .get({fileId, alt: 'media'}, {responseType: 'stream'})
            .then(res => {
                return new Promise((resolve, reject) => {
                    const dest = fs.createWriteStream(filePath);
                    let progress = 0;

                    res.data
                        .on('end', () => {
                            console.log('Done downloading file.');
                            resolve(dest)
                        })
                        .on('error', err => {
                            console.error('Error downloading file.');
                            reject(err);
                        })
                        .on('data', d => {
                            progress += d.length;
                            if (process.stdout.isTTY) {
                                process.stdout.clearLine();
                                process.stdout.cursorTo(0);
                                process.stdout.write(`Downloaded ${progress} bytes`);
                            }
                        })
                        .pipe(dest);
                });
            });
    }

    syncFiles() {
        const keys = Array.from(new Set(Object.keys(this.files).concat(Object.keys(folderStructure.files))));
        console.log(keys)
        keys.forEach(key => {
            key = key.replaceAll('///', '/').replaceAll('//', '/')
            let existsLocally = folderStructure.files.hasOwnProperty(key);
            let existsCloud = this.files.hasOwnProperty(key)
            if (existsLocally && existsCloud) {
                // Sync files based on time
            } else if (existsCloud) {
                // Sync file from cloud storage to local storage
                let fileName = this.files[key].name.split('/').pop()
                let pathArr = key.split('/');
                if (pathArr[0] === '') pathArr.shift(); // Remove "" from folder paths (root folder which always exists!)
                pathArr.pop()


                let existingPath = '';
                while (pathArr.length > 0) {
                    let tempPath = `${existingPath}/${pathArr.shift()}`.replaceAll('//', '/');

                    if (folderStructure.folders.hasOwnProperty(tempPath)) {
                        existingPath = tempPath;
                    } else {
                        console.log(`Error syncing file. The folder in which the file should be placed in doesn't exist.`)
                        logger.error(`Error syncing file. The folder in which the file should be placed in doesn't exist.`)
                        break;
                    }
                }
                let filePath = '';
                if (existingPath !== '') {
                    filePath = `${folderStructure.folders[existingPath]}/${encryption.encryptPath(pathArr.join('/'))}/${fileName}`;
                } else {
                    filePath = `${encryption.encryptPath(pathArr.join('/'))}/${fileName}`;
                }
                filePath = filePath.replaceAll('///', '/').replaceAll('//', '/');
                logger.info(`creating new file at path: ${filePath}`)
                console.log(`creating new file at path: ${filePath}`)
                console.log(encryption.decryptPath(filePath))
                let fileId = this.files[encryption.decryptPath(filePath)]['id']
                console.log(fileId)
                console.log(filePath)
                this.syncFileFromDrive(fileId, filePath)
            } else {
                // Sync file from local storage to cloud storage
            }
        })
    }

    sync() {
        this.syncFolders();
    }
}

