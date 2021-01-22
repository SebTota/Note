const express = require('express')
const https = require('https')
const {google} = require('googleapis');
const encryption = require('../encryption');
const config = require('../config');

const googleBaseUrl = 'https://accounts.google.com/o/oauth2/v2/auth?';
const googleClientId = '604030377902-ks4fj8c1ru62c3i1rivtfj19grpsnnc5.apps.googleusercontent.com';
const googleEncryptedClientSecret = 'ijly3K50taNrIcwB/HZLwA==hEZ2J8UJFI2XObzecQpXpg==V/08xX++ZxwjUXjwkqVuNSJbdb2KuR9h';
const googleScope = 'https://www.googleapis.com/auth/drive';
const googleRedirectUrl = 'http://127.0.0.1:3000/google-authorized';
const googleResponseType = 'code';

const googleMimeFolder = 'application/vnd.google-apps.folder';

module.exports = class GoogleAuth {
    constructor(name) {
        this.oAuth2Client = undefined;
        this.drive = undefined;
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

    authenticate(driveName, clientId=googleClientId, clientSecret=encryption.show(googleEncryptedClientSecret)) {
        this.oAuth2Client = new google.auth.OAuth2(
            clientId, clientSecret, googleRedirectUrl);

        // Check if we have previously stored a token.
        if (config.getValue(`${driveName}.token`)) {
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

            config.setValue(`${driveName}`, {});
            config.setValue(`${driveName}.token`, encryption.hide(JSON.stringify(token)));
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
            if (err) return console.log('The API returned an error: ' + err);
            const files = res.data.files;
            if (files.length) {
                files.map((file) => {
                    if (file.name !== '.DS_Store') {
                        if (file.mimeType === googleMimeFolder) {
                            this.folders[encryption.decryptPath(folderPath + file.name) + '/'] = `${folderPath + file.name}/`
                            this.listItems(itemType, file.id, `${folderPath + file.name}/`)
                        } else {
                            this.files[encryption.decryptPath(folderPath + file.name)] = {'name': folderPath + file.name, 'id': file.id};
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

    createNewFolder(folderPath) {
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
}

