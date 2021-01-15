const express = require('express')
const https = require('https')

const googleBaseUrl = 'https://accounts.google.com/o/oauth2/v2/auth?';
const googleClientId = '604030377902-ks4fj8c1ru62c3i1rivtfj19grpsnnc5.apps.googleusercontent.com';
const googleClientSecret = '3-PyWc1O_1IahIOs_IGJ5UgG';
const googleScope = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata';
const googleRedirectUrl = 'http://127.0.0.1:3000/google-authorized';
const googleResponseType = 'code';

module.exports = class GoogleAuth {
    // Create a temporary local server to host Google OAuth process
    // Need to create a local server to serve these files because Google doesn't support OAuth on "file://"
    static startAuthServer(clientId=googleClientId) {
        const app = express()

        app.get('/google-launch-auth', (req, res) => {
            // Create OAuth redirect URL based on app data (client id)
            const redirectUrl = `${googleBaseUrl}client_id=${clientId}&redirect_uri=${googleRedirectUrl}&response_type=${googleResponseType}&scope=${googleScope}`

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
}

