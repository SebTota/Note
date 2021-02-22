const express = require('express')
const {google} = require('googleapis');
const encryption = require('../encryption');
const config = require('../config');
const folderStructure = require('../folder-structure');
const fs = require('fs');
const path = require('path');
const ResumableUpload = require('node-google-resumable-upload')

const userDataPath = app.getPath('userData') + "/user/files";
const userAssetPath = app.getPath('userData') + "/user/assets";

const googleBaseUrl = 'https://accounts.google.com/o/oauth2/v2/auth?';
const googleClientId = '604030377902-ks4fj8c1ru62c3i1rivtfj19grpsnnc5.apps.googleusercontent.com';
const googleEncryptedClientSecret = 'ijly3K50taNrIcwB/HZLwA==hEZ2J8UJFI2XObzecQpXpg==V/08xX++ZxwjUXjwkqVuNSJbdb2KuR9h';
const googleScope = 'https://www.googleapis.com/auth/drive';
const googleRedirectUrl = 'http://127.0.0.1:3000/google-authorized';
const googleResponseType = 'code';
const driveHomeFolder = '_NOTE_';
const driveFileFolder = '_FILE_';
const driveAssetsFolder = '_ASSETS_';
const ignoreFiles = ['.DS_Store'];

const googleMimeFolder = 'application/vnd.google-apps.folder';

module.exports = class GoogleAuth {
    constructor(name, callback= function() {}) {
        this.oAuth2Client = undefined;
        this.drive = undefined;
        this.driveName = 'drive';
        this.authenticate(name, callback).then(() => {
            this.mapCloudDirectory().then(() => {
                console.log(`Google Drive Sync: Done mapping drive directory structure.`)
            })
        })


        this.noteFolderId = undefined;
        this.fileFolderId = undefined;
        this.assetsFolderId = undefined;

        this.files = {};
        this.folders = {};
        this.assets = {};
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
    async authenticate(driveName, callback, forceNew=false) {
        return new Promise((resolve) => {
            const clientId = googleClientId;
            const clientSecret = encryption.show(googleEncryptedClientSecret);

            this.oAuth2Client = new google.auth.OAuth2(
                clientId, clientSecret, googleRedirectUrl);

            // Check if we have previously stored a token.
            if (!forceNew && config.getValue(`${driveName}.token`)) {
                // Read existing local token
                this.oAuth2Client.setCredentials(JSON.parse(encryption.show(config.getValue(`${driveName}.token`))));
                const auth = this.oAuth2Client
                this.drive = google.drive({version: 'v3', auth});
                resolve();
            } else {
                // Start authentication server and set callback to generate an access token with the authentication code
                this.startAuthServer(clientId,(code) => {
                    this.getAccessToken(driveName, code);
                    callback();
                    resolve();
                })
                /*
                * Open a new tab in users default browser for the authentication process.
                * Google no longer allows in application authentication for Node.js application so the user
                * must sign in using a 'real' browser
                 */
                require("electron").shell.openExternal('http://localhost:3000/google-launch-auth');
            }
        })
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
    * @param {string} indicates the item type(file, folder, all) to search for
    * @param {string} id of parent to specify which folder to search for ('root' specifies root directory)
    * @param {string} specify local file/folder path to append to the beginning of the file/folder path
    * @returns {dict{files: {}, folders: {}}} returns a dictionary containing dictionary of all files and folders
    * If itemType is specified is file or folder than the other dictionary will be empty
     */
    async listItems(itemType='all', parent='root', folderPath='/') {
        if (!(itemType === 'file' || itemType === 'folder' || itemType === 'all')) {
            throw {'name': 'Invalid object type', 'message': 'Error: Choose "file", "folder", "all" as file type'}
        }

        let items = {'files': {}, 'folders': {}};

        // Build search criteria
        let qVal = '';

        // Filter by object type (file/folder) if specified
        if (itemType !== 'all') { qVal += `mimeType = 'application/vnd.google-apps.${itemType}' and` }

        // Set parent (use 'root' as default) and make sure file is not trashed
        qVal += `'${parent}' in parents and trashed = false`

        let res = await this.drive.files.list({
            pageSize: 100,
            q: qVal,
            fields: '*',
        });

        const files = res.data.files;
        for (let i = 0; i < files.length; i++) {
            let file = files[i];

            // Skip files specified in ignoreFiles array
            if (ignoreFiles.includes(file.name)) { continue; }

            if (file.mimeType === googleMimeFolder) {
                items.folders[encryption.decryptPath(folderPath + file.name)] = {
                    'path': `${folderPath + file.name}`,
                    'id': file.id
                }
                let tempItems = await this.listItems(itemType, file.id, `${folderPath + file.name}/`)
                // Concat tempItems files dictionary with the current dictionary of files
                tempItems.hasOwnProperty('files') ? items.files = Object.assign({}, tempItems.files, items.files): null;
                // Concat tempItems folders dictionary with current dictionary of folders
                tempItems.hasOwnProperty('folders') ? items.folders = Object.assign({}, tempItems.folders, items.folders): null;
            } else {
                items.files[encryption.decryptPath(folderPath + file.name)] =
                    {
                        'path': folderPath + file.name,
                        'id': file.id,
                        'mtime': file.modifiedTime,
                        'parents': file.parents
                    };
            }
        }

        return items
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

        return new Promise((resolve) => {
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
                resolve()
            }
        })});
    };

    /*
    * Create a new folder in Google Drive
    * @param {string}   Path of the local folder. Absolute and relative paths are accepted as well as simple folder names
    * @param {array}    Array containing a single string indicating the folder id of the parent folder
     */
    async createNewCloudFolder(folderPath, parents=['root']) {
        if (typeof parents === 'string') { parents = [parents] }
        let folders = folderPath.split('/')
        let folderName = folders.pop()

        var fileMetadata = {
            'name': folderName,
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': parents
        };

        const folder = await this.drive.files.create({
            resource: fileMetadata
        });

        console.log(folder)

        return folder.data.id

        if (folder.hasOwnProperty('id') && folder.hasOwnProperty('parents')) {
            return {'id': folder.id, 'parents': folder.parents };
        }

        if (folder.hasOwnProperty('data') && folder.data.hasOwnProperty('id') && folder.data.hasOwnProperty('parents')) {
            return {'id': folder.data.id, 'parents': folder.data.parents };
        }

        logger.error(`Google Drive Sync: Error creating new cloud folder. Return type didn't include id and parent.`)
    }

    /*
    * Sync folders from local storage and cloud storage so that the directory structure is the same locally
    * and in the cloud storage provider.
     */
    async syncFolders() {
        if (!(this.hasOwnProperty('folders') && folderStructure.hasOwnProperty('folders'))) {
            return;
        }
        const keys = Array.from(new Set(Object.keys(this.folders).concat(Object.keys(folderStructure.folders))));
        for (let i = 0; i < keys.length; i++) {
            // Select and clean key path
            let key = path.normalize(keys[i]);

            if (this.folders.hasOwnProperty(key) && folderStructure.folders.hasOwnProperty(key)) {
                // Folder is already synced
                continue;
            }

            if (this.folders.hasOwnProperty(key)) {
                // Only exists in the cloud, create the folder locally
                /*
                    * This will cause some collisions since the local folders dictionary doesn't get updated
                    * as we add new folders. This should not cause any issues because createNewFolder()
                    * checks if the folder exists before creating the new folder.
                    * Ex. If the path is '/test/folder1' and '/test' exists but '/folder1' doesn't
                    * we need to check if 'test' exists first because we are using probabilistic encryption
                    * to encrypt the entire path meaning the '/test' folder will have a different encrypted name.
                     */

                let foldersInPath = key.split('/');
                if (foldersInPath[0] === '') foldersInPath.shift(); // Remove "" from folder paths (root folder which always exists!)

                let subFolderPath = ''; // Holds the path of which folders in the path already exist locally
                for (let i = 0; i < foldersInPath.length; i++) {
                    let tempPath = path.normalize(`${subFolderPath}/${foldersInPath[i]}`);

                    if (!(folderStructure.folders.hasOwnProperty(tempPath))) {
                        // Create sub folder because it doesn't yet exist locally
                        if (this.folders.hasOwnProperty(tempPath)) {
                            folderStructure.createNewFolder(this.folders[tempPath]['path'])
                        } else {
                            // Should never need to use this function because the sub folder should always be
                            // listed in the list of cloud folders
                            folderStructure.createNewFolder(encryption.encryptPath(tempPath))
                        }
                    }
                    subFolderPath = tempPath;
                    foldersInPath.shift()
                }

                let folderPath = '';
                if (subFolderPath !== '') {
                    folderPath = `/${folderStructure.folders[subFolderPath]}/${encryption.encryptPath(foldersInPath.join('/'))}`;
                } else {
                    folderPath = `/${encryption.encryptPath(foldersInPath.join('/'))}`;
                }
                folderPath = path.normalize(folderPath)

                logger.info(`Creating a new folder at path: ${folderPath}`)
                folderStructure.createNewFolder(folderPath);
            } else {
                // Only exists locally, create the folder in the cloud
                let foldersInPath = key.split('/');
                if (foldersInPath[0] === '') foldersInPath.shift(); // Remove "" from folder paths (root folder which always exists!)

                let parentFolderPath = '';
                let builtPath = '';
                let parent = [this.fileFolderId];

                for (let i = 0; i < foldersInPath.length; i++) {
                    builtPath += `/${foldersInPath[i]}`;

                    if (!this.folders.hasOwnProperty(builtPath)) {
                        if (this.folders.hasOwnProperty(parentFolderPath)) {
                            parent = [this.folders[parentFolderPath].id];
                        } else {
                            logger.error(`Google Drive Sync: Error creating cloud folder. Couldn't find parent id of ${parentFolderPath}`);
                        }

                        let folderId = await this.createNewCloudFolder(folderStructure.folders[builtPath], parent);
                        console.log(folderId)
                        if (folderId === undefined) {
                            logger.error(`Google Drive Sync: Create new cloud folder returned an undefined folder id. Not adding folder to synced folder list. Folder path: ${builtPath}`)
                        }

                        this.folders[builtPath] = {
                                'path': folderStructure.folders[builtPath],
                                'id': folderId
                            }
                    }
                    parentFolderPath = builtPath;
                }
            }
        }
    }

    /*
    * Rename file or folder stored in Google Drive
    * @param {string}   Type of item being renamed ('file' or 'folder')
    * @param {string}   The old (pre rename) decrypted relative path of the file
    * @param {string}   Files new encrypted name
     */
    async renameItem(itemType, oldRelPath, encNewName) {
        if (!(itemType === 'file' || itemType === 'string')) return console.log(`Google Drive Sync: Rename item: Indicate if item is 'file' or 'folder'`);

        let decNewName = encryption.decryptPath(encNewName);

        // Make sure file actually has new name
        let oldName = oldRelPath.split('/').pop();
        if (decNewName === oldName) return console.log(`Google Drive Sync: Skipping renaming item ${decNewName}. New name is the same as old name.`)

        let newRelPath = oldRelPath.split('/');
        newRelPath[newRelPath.length - 1] = decNewName;
        newRelPath = newRelPath.join('/');

        // Get item id based on the pre-rename relative path
        let itemId;
        if (itemType === 'file') {
            itemId = this.files[oldRelPath].id;
        } else {
            itemId = this.folders[oldRelPath].id;
        }

        return new Promise((resolve, reject) => {
            this.drive.files.update({
                fileId: itemId,
                resource: {
                    'name': encNewName
                }
            }, (err, res) => {
                if (err) {
                    console.log(`Google Drive Sync: Failed updating name of: ${itemId}. Err: ${err}`);
                    reject();
                }

                console.log(res)

                // Rename the key of the specified object to reflect new name
                if (itemType === 'folder') {
                    Object.defineProperty(this.folders, newRelPath, Object.getOwnPropertyDescriptor(this.folders, oldRelPath));
                    delete this.folders[oldRelPath];

                    // TODO: this.files and this.folders should not have the local file path! It should be referenced to in folderStructure
                    // Fix path to point to renamed file
                    this.folders[newRelPath].path = folderStructure.folders[newRelPath].path;
                } else {
                    Object.defineProperty(this.files, newRelPath, Object.getOwnPropertyDescriptor(this.files, oldRelPath));
                    delete this.files[oldRelPath];
                    this.files[newRelPath].path = folderStructure.files[newRelPath].path;
                }

                resolve();
            })
        })
    }

    /*
    * Download a file from Google Drive to local storage.
    * @param {string} Unique file id of file stored in Google Drive
    * @param {string} Local path of where the file should be download to
    * @param {Date}   Optional: Set file modification time after download
     */
    async downloadFileFromDrive(fileId, filePath, mtime=undefined) {
        filePath = path.normalize(filePath);

        logger.info(`Sync file from drive: Syncing file to path: ${filePath}`);

        return new Promise((resolve) => {
            this.drive.files
                .get({fileId, alt: "media"}, {responseType: 'stream'})
                .then((res) => {
                    const dest = fs.createWriteStream(filePath);

                    const decoder = new TextDecoder("utf-8");
                    const reader = res.data.getReader()
                    reader.read().then(function processText({done, value}) {
                        if (done) {
                            if (mtime !== undefined) {
                                console.log(`Setting time: ${mtime}`);
                                fs.utimesSync(filePath, mtime, mtime)
                            }
                            console.log("Stream complete");
                            folderStructure.buildFileMenu()
                            resolve();
                            return;
                        }
                        dest.write(decoder.decode(value))

                        // Read some more, and call this function again
                        return reader.read().then(processText);
                    });
                })
        });
    }

    /*
    * Upload file to Google Drive by either creating a new file if no fileId is specified, or uploading a new version
    * of a file if fileId if specified.
    * param {string}    Local path of file to upload
    * param {[string]}  String array of length 1 indicating the id of the files parent folder
    * param {string}    Unique fileId of the file you want to update. Creates new file if fileId doesn't exist
     */
    async uploadFileToDrive(filePath, parents, fileId=undefined) {
        if (parents === undefined) return logger.error(`Google Drive Sync: Failed uploading file to drive. Parents not specified for file ${filePath}`) ;
        if (typeof parents === 'string') parents = [parents];
        if (parents.length > 1) return logger.error(`Google Drive Sync: Failed uploading file to drive. Too many parents specified for file ${filePath}`);

        filePath = path.normalize(filePath);

        // Make sure file exists before uploading
        if (!(fs.existsSync(filePath))) {
            logger.error(`Google Drive Sync: Error uploading file to drive. File doesn't exist locally.`)
            return;
        }

        const mTime = fs.statSync(filePath).mtime;

        const fileName = filePath.split('/').pop();
        logger.info(`Google Drive Sync: Uploading file to drive ${filePath}`)

        let uploadFile = new ResumableUpload()
        uploadFile.tokens = JSON.parse(encryption.show(config.config[this.driveName]['token']));
        uploadFile.refreshToken = true;
        uploadFile.clientId = googleClientId;
        uploadFile.clientSecret = encryption.show(googleEncryptedClientSecret)
        uploadFile.filePath = filePath;

        /*
        * If fileId is not specified, upload the file as a new file.
        * If fileId is specified, upload the content of an existing file.
         */
        if (fileId === undefined) {
            // Upload new file
            uploadFile.metadataBody = {
                'name': fileName,
                'parents': parents,
                'modifiedTime': mTime
            }
        } else {
            // Upload an update to an existing file
            uploadFile.initMethod = 'PATCH';
            uploadFile.pathParam = fileId;
            uploadFile.metadataBody = {
                'modifiedTime': mTime
            }
        }

        console.log(uploadFile)

        uploadFile.upload()

        uploadFile.on('success', function(s) {
            console.log(s)
        })

        uploadFile.on('error', function(err) {
            console.log(err)
        })

        uploadFile.on('progress', function(p) {
            console.log(p)
        })
    }

    async syncFileFromDrive(key, cloudFiles, rootPath, fileMtime) {
        let fileName = cloudFiles[key].path.split('/').pop()
        let pathArr = key.split('/');
        if (pathArr[0] === '') pathArr.shift(); // Remove "" from folder paths (root folder which always exists!)
        pathArr.pop()

        let existingPath = '';
        while (pathArr.length > 0) {
            let tempPath = `${existingPath}/${pathArr.shift()}`.replaceAll('//', '/');

            if (folderStructure.folders.hasOwnProperty(tempPath)) {
                existingPath = tempPath;
            } else {
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
        filePath = path.normalize(filePath)
        logger.info(`creating new file at path: ${filePath}`)
        let fileId = cloudFiles[encryption.decryptPath(filePath)]['id']
        filePath = path.normalize(`${rootPath}/${filePath}`);
        await this.downloadFileFromDrive(fileId, filePath, fileMtime);
    }

    async syncFileToDrive(key, localFiles, cloudFiles, rootPath, cloudParent) {
        let filePath = `${rootPath}/${localFiles[key]['path']}`
        filePath = path.normalize(filePath)

        let parentFolderPath = key.split('/')
        parentFolderPath.pop();
        parentFolderPath = parentFolderPath.join('/')

        // Check if file already exists in cloud files
        // If file already exists in cloud files list, then use the id to update the file
        // rather than creating a new file.
        let fileId = undefined;
        if (cloudFiles.hasOwnProperty(key)) {
            fileId = cloudFiles[key].id;
        }

        if (this.folders.hasOwnProperty(parentFolderPath)) {
            cloudParent = [this.folders[parentFolderPath].id];
        }
        await this.uploadFileToDrive(filePath, cloudParent, fileId);
    }

    /*
    * @param {dict} dictionary containing mappings of decrypted local file names to file information
    * @param {dict} dictionary containing mappings of decrypted cloud file names to file information
    * @param {string} the starting local root directory to complete the relative path of the dictionary keys
    * @param {array[string]} an array containing a single string which is the id of the parent cloud folder
     */
    async syncFiles(localFiles, cloudFiles, rootPath, cloudParent) {
        // Make sure cloud parent is an array of length one per Google requirements
        if (typeof(cloudParent) === 'string') cloudParent = [cloudParent]
        if (cloudParent.length > 1) return logger.error(`Google cloud sync: Cloud Parent array can only have one id.`)

        // Get all the unique keys between cloud and local files
        // Keys are decrypted relative paths of files
        const keys = Array.from(new Set(Object.keys(localFiles).concat(Object.keys(cloudFiles))));
        for (let i = 0; i < keys.length; i++) {
            // Select and clean key path
            let key = path.normalize(keys[i]);

            // Check which dictionaries contain the key to check if file exists on local, cloud, or both
            let existsLocally = localFiles.hasOwnProperty(key);
            let existsCloud = cloudFiles.hasOwnProperty(key);

            if (existsLocally && existsCloud) {
                // Sync files based on time
                if (localFiles[key].mtime === cloudFiles[key].mtime) {
                    logger.info(`Google Drive Sync: No sync needed. File is already synced. ${key}`)
                } else if (localFiles[key].mtime > cloudFiles[key].mtime) {
                    // Local file is newer
                    logger.info(`Google Drive Sync: Syncing file update from Google Drive for file ${key}.`);
                    await this.syncFileToDrive(key, localFiles, cloudFiles, rootPath, cloudParent);
                } else {
                    // Cloud file is newer
                    logger.info(`Google Drive Sync: Syncing file update to Google Drive for file ${key}.`);
                    let fileMtime = new Date(cloudFiles[keys[i]].mtime);
                    await this.syncFileFromDrive(key, cloudFiles, rootPath, fileMtime);
                }
            } else if (existsCloud) {
                // Sync file from cloud storage to local storage
                logger.info(`Google Drive Sync: Syncing new file from Google Drive. ${key}`)
                let fileMtime = new Date(cloudFiles[keys[i]].mtime);
                await this.syncFileFromDrive(key, cloudFiles, rootPath, fileMtime);
            } else {
                // Sync file from local storage to cloud storage
                logger.info(`Google Drive Sync: Syncing new file to Google Drive. ${key}`)
                await this.syncFileToDrive(key, localFiles, cloudFiles, rootPath, cloudParent);
            }
        }
    }

    /*
    * Creates a local map of all the files and folders in the associated Google Drive.
     */
    async mapCloudDirectory() {
        // Check if sync has been called before and noteFolderId is already initiated
        if (this.noteFolderId === undefined) {
            this.noteFolderId = await this.getItemId('folder', driveHomeFolder, '');
        }

        // DO NOT MERGE THIS WITH THE PREVIOUS CONDITION STATEMENT
        // Check if the root _NOTE_ folder exists
        if (this.noteFolderId === undefined) {
            // Create _NOTE_ folder and child folders for files and assets
            this.noteFolderId = await this.createNewCloudFolder(driveHomeFolder, ['root']);
            this.fileFolderId = await this.createNewCloudFolder(driveFileFolder, [this.noteFolderId.toString()]);
            this.assetsFolderId = await this.createNewCloudFolder(driveAssetsFolder, [this.noteFolderId.toString()]);
        } else {
            if (this.fileFolderId === undefined) {
                // Check if the File folder exists
                this.fileFolderId = await this.getItemId('folder', driveFileFolder, '', this.noteFolderId.toString());
                // Create File folder if it doesn't exist
                if (this.fileFolderId === undefined) {
                    this.fileFolderId = await this.createNewCloudFolder(driveFileFolder, [this.noteFolderId.toString()]);
                }
            }

            if (this.assetsFolderId === undefined) {
                // Check if the Assets folder exists
                this.assetsFolderId = await this.getItemId('folder', driveAssetsFolder, '', this.noteFolderId.toString());
                // Create Assets folder if it doesn't exist
                if (this.assetsFolderId === undefined) {
                    this.assetsFolderId = await this.createNewCloudFolder(driveAssetsFolder, [this.noteFolderId.toString()]);
                }
            }
        }

        await this.listItems('all', this.fileFolderId, '/').then((res) => {
            res.hasOwnProperty('files') ? this.files = res.files : null;
            res.hasOwnProperty('folders') ? this.folders = res.folders : null;
        }).catch((err) => {
            logger.error(`Google Drive Sync: Error listing items given params: ${err}`)
        });

        await this.listItems('all', this.assetsFolderId, '/').then((res) => {
            res.hasOwnProperty('files') ? this.assets = res.files : null;
        }).catch((err) => {
            logger.error(`Google Drive Sync: Error listing items given params: ${err}`)
        });
    }

    async sync() {
        logger.info(`Google Cloud Sync: Starting cloud sync.`)
        folderStructure.getAssetFiles(); // Update asset files
        folderStructure.getDirStructure(); // Update note files

        await this.mapCloudDirectory();

        await this.syncFolders();
        folderStructure.hasOwnProperty('files') ? await this.syncFiles(folderStructure.files, this.files, userDataPath, this.fileFolderId) : null;
        folderStructure.hasOwnProperty('assets') ?
            await this.syncFiles(folderStructure.assets, this.assets, userAssetPath, this.assetsFolderId) :
            logger.info(`Google Cloud Sync: Can't sync assets. folderStructure is missing assets key.`);
    }
}