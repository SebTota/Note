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

    /*
    * Create a local server to host the Google OAuth authentication web page and listen for the response.
    * Execute given callback when the response has been received.
    * TODO: Create alternative to copy and paste code for users who do not want to allow the application to
    *  create a local webserver
     */
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
            // Inform the user to return to the desktop application
            res.send('You are logged in. You can now close this page and go back to the application.');
            const code = req.query.code;
            server.close() // Close local webserver
            callback(code)
        })

        // Start listening on specified port
        // TODO: Iterate over server ports when port 3000 is in use
        const server = app.listen(3000)
    }

    /*
     * Create an OAuth2 client with the given credentials.
     */
    authenticate(driveName, forceNew=false, clientId=googleClientId, clientSecret=encryption.show(googleEncryptedClientSecret)) {
        this.oAuth2Client = new google.auth.OAuth2(
            clientId, clientSecret, googleRedirectUrl);

        // Check if we have previously stored a token.
        if (!forceNew && config.getValue(`${driveName}.token`)) {
            // Read existing local token
            this.oAuth2Client.setCredentials(JSON.parse(encryption.show(config.getValue(`${driveName}.token`))));
            const auth = this.oAuth2Client
            this.drive = google.drive({version: 'v3', auth});
        } else {
            // Start authentication server and set callback to generate an access token with the authentication code
            this.startAuthServer(clientId,(code) => {
                this.getAccessToken(driveName, code);
            })
            /*
            * Open a new tab in users default browser for the authentication process.
            * Google no longer allows in application authentication for Node.js application so the user
            * must sign in using a 'real' browser
             */
            require("electron").shell.openExternal('http://localhost:3000/google-launch-auth');
        }
    }
    /*
     * Get and store new authentication token in config file. Obscure token before storing in config file.
     */
    getAccessToken(driveName, code) {
        this.oAuth2Client.getToken(code, (err, token) => {
            if (err) return logger.error('Error retrieving access token', err);
            this.oAuth2Client.setCredentials(token);
            const auth = this.oAuth2Client
            this.drive = google.drive({version: 'v3', auth});
            this.driveName = driveName;

            config.setValue(`${driveName}`, {}, true);
            config.setValue(`${driveName}.token`, encryption.hide(JSON.stringify(token)), true);
        });
    }

    /*
    * Get all of the items(files and/or folders) in a given folder
     */
    async listItems(itemType='all', parent='root', folderPath='/') {
        if (!(itemType === 'file' || itemType === 'folder' || itemType === 'all')) {
            throw {'name': 'Invalid object type', 'message': 'Error: Choose "file", "folder", "all" as file type'}
        }

        // Build search criteria
        let qVal = '';

        // Filter by object type (file/folder) if specified
        if (itemType !== 'all') { qVal += `mimeType = 'application/vnd.google-apps.${itemType}' and` }

        qVal += `'${parent}' in parents and trashed = false`

        let res = await this.drive.files.list({
            pageSize: 100,
            q: qVal,
            fields: 'nextPageToken, files',
        });

        const files = res.data.files;
        for (let i = 0; i < files.length; i++) {
            let file = files[i];
            if (file.name !== '.DS_Store') {
                if (file.mimeType === googleMimeFolder) {
                    this.folders[encryption.decryptPath(folderPath + file.name)] = `${folderPath + file.name}`
                    await this.listItems(itemType, file.id, `${folderPath + file.name}/`)
                } else {
                    this.files[encryption.decryptPath(folderPath + file.name)] =
                        {
                            'name': folderPath + file.name,
                            'id': file.id,
                            'mtime': file.modifiedTime
                        };
                }
            }
        }
    }

    /*
    * Get the id of a folder or file by searching for it by it's name and parent
     */
    async getItemId(itemType, itemName, itemPath, parent = 'root') {
        if (typeof(itemName) !== 'string') { return }
        if (!(itemType === 'file' || itemType === 'folder')) {
            throw {'name': 'Invalid object type', 'message': 'Error: Choose "file" or "folder" as file type'}
        }

        let name = itemName

        let qVal = '';
        let mime = `application/vnd.google-apps.${itemType}`;
        qVal += `mimeType = '${mime}' and name = '${name}' and '${parent}' in parents and trashed = false`

        return new Promise((resolve, reject) => {
            this.drive.files.list({
            q: qVal,
            pageSize: 10,
            fields: 'nextPageToken, files',
        }, (err, res) => {
            if (err) return logger.error('The API returned an error: ' + err);
            const files = res.data.files;
            if (files.length > 0) {
                if (files.length > 1) {
                    logger.warn(`Google Drive Sync: Found more than one item id given the params. Returning first item`)
                }
                resolve(files[0].id);
            } else {
                logger.warn(`Google Drive Sync: Couldn't find item id given the params`)
                reject()
            }
        })});
    };

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

    async syncFileFromDrive(fileId, filePath) {
        filePath.replace(userDataPath, '');
        filePath = `${userDataPath}/${filePath}`;
        filePath.replaceAll('//', '/');

        logger.info(`Sync file from drive: Syncing file to path: ${filePath}`);
        logger.info(`Sync file from drive: File id: ${fileId}`)

        this.drive.files
            .get({ fileId, alt: "media"}, {responseType: 'stream'})
            .then((res) => {
                const dest = fs.createWriteStream(filePath);

                const decoder = new TextDecoder("utf-8");
                const reader = res.data.getReader()
                reader.read().then(function processText({ done, value }) {
                    if (done) {
                        console.log("Stream complete");
                        folderStructure.buildFileMenu()
                        return;
                    }
                    dest.write(decoder.decode(value))

                    // Read some more, and call this function again
                    return reader.read().then(processText);
                });
            })
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
                let fileId = this.files[encryption.decryptPath(filePath)]['id']
                console.log(fileId)
                this.syncFileFromDrive(fileId, filePath);
            } else {
                // Sync file from local storage to cloud storage
            }
        })
    }

    async sync() {
        const noteFolderId = await this.getItemId('folder', '_NOTE_', '');
        await this.listItems('all', noteFolderId, '/').catch((err) => {
            logger.error(`Google Drive Sync: Error listing items given params: ${err}`)
        })
        console.log(this.folders)
        this.syncFolders();
        this.syncFiles();
    }
}

