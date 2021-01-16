const express = require('express')
const https = require('https')
const {google} = require('googleapis');
const encryption = require('../encryption');

const googleBaseUrl = 'https://accounts.google.com/o/oauth2/v2/auth?';
const googleClientId = '604030377902-ks4fj8c1ru62c3i1rivtfj19grpsnnc5.apps.googleusercontent.com';
const googleEncryptedClientSecret = 'ijly3K50taNrIcwB/HZLwA==hEZ2J8UJFI2XObzecQpXpg==V/08xX++ZxwjUXjwkqVuNSJbdb2KuR9h';
const googleScope = 'https://www.googleapis.com/auth/drive';
const googleRedirectUrl = 'http://127.0.0.1:3000/google-authorized';
const googleResponseType = 'code';

module.exports = class GoogleAuth {
    static authorizeUser() {
        this.authorize(this.testFun())
    }

    // Create a temporary local server to host Google OAuth process
    // Need to create a local server to serve these files because Google doesn't support OAuth on "file://"
    static startAuthServer(clientId = googleClientId) {
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
            console.log(req.query.code)
            console.log(req.query.scope)
            server.close()
        })

        // Start listening on specified port
        const server = app.listen(3000)
    }

    static authorize() {
        const oAuth2Client = new google.auth.OAuth2(
            googleClientId, encryption.show(googleEncryptedClientSecret), googleRedirectUrl);

        this.getAccessToken(oAuth2Client, this.testFun());
        this.startAuthServer()
        /*
        // Check if we have previously stored a token.
        fs.readFile(TOKEN_PATH, (err, token) => {
            if (err) return getAccessToken(oAuth2Client, callback);
            oAuth2Client.setCredentials(JSON.parse(token));
            callback(oAuth2Client);
        });
         */
    }

    static getAccessToken(oAuth2Client, callback) {
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: googleScope,
        });
        /*
        rl.question('Enter the code from that page here: ', (code) => {
            rl.close();
            oAuth2Client.getToken(code, (err, token) => {
                if (err) return console.error('Error retrieving access token', err);
                oAuth2Client.setCredentials(token);
                // Store the token to disk for later program executions
                fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                    if (err) return console.error(err);
                    console.log('Token stored to', TOKEN_PATH);
                });
                callback(oAuth2Client);
            });
        });
         */
    }

    static testFun() {
        console.log('success');
    }

}

