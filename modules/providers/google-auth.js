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

module.exports = class GoogleAuth {
    // Create a temporary local server to host Google OAuth process
    // Need to create a local server to serve these files because Google doesn't support OAuth on "file://"
    static startAuthServer(oAuth2Client, clientId = googleClientId) {
        const app = express()

        app.get('/google-launch-auth', (req, res) => {
            // Create OAuth redirect URL based on app data (client id)
            const redirectUrl = `${googleBaseUrl}access_type=offline&client_id=${clientId}&redirect_uri=${googleRedirectUrl}&response_type=${googleResponseType}&scope=${googleScope}`

            // Redirect users to Google OAuth login
            res.send(`<html><body><script>window.location.href='${redirectUrl}'</script></body></html>`)
        })

        // Listen for authorization token to be returned from OAuth process
        app.get('/google-authorized', (req, res) => {
            res.send('You are logged in. You can now close this page and go back to the application.')
            this.getAccessToken(oAuth2Client, req.query.code);
            server.close()
        })

        // Start listening on specified port
        const server = app.listen(3000)
    }

    static authorize() {
        const oAuth2Client = new google.auth.OAuth2(
            googleClientId, encryption.show(googleEncryptedClientSecret), googleRedirectUrl);

        // Check if we have previously stored a token.
        if (config.getValue('drive.token')) {
            oAuth2Client.setCredentials(JSON.parse(encryption.show(config.getValue('drive.token'))));
        } else {
            this.startAuthServer(oAuth2Client)
            require("electron").shell.openExternal('http://localhost:3000/google-launch-auth');
        }
    }

    static getAccessToken(oAuth2Client, code) {
        oAuth2Client.getToken(code, (err, token) => {
            if (err) return console.error('Error retrieving access token', err);
            oAuth2Client.setCredentials(token);

            config.setValue('drive', {});
            config.setValue('drive.token', encryption.hide(JSON.stringify(token)));
        });
    }
}

