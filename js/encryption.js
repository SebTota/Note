function encrypt(text, key=config['auth_info']['key']) {
    let iv = crypto.randomBytes(16);
    let cipher = crypto.createCipheriv('aes-256-ctr', Buffer.from(key, 'hex'), iv);
    let encrypted = cipher.update(text);

    encrypted = Buffer.concat([encrypted, cipher.final()]);

    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text, key=config['auth_info']['key']) {
    let textParts = text.split(':');
    let iv = Buffer.from(textParts.shift(), 'hex');
    let encryptedText = Buffer.from(textParts.join(':'), 'hex');
    let decipher = crypto.createDecipheriv('aes-256-ctr', Buffer.from(key, 'hex'), iv);
    let decrypted = decipher.update(encryptedText);

    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

function encryptFileToDiskFromStringSync(text, filePath) {
    fs.writeFileSync(filePath, encrypt(text.replaceAll(new RegExp('src="data:image.*?\\"', "g"), 'src=""')));
}

async function encryptFileToDiskFromString(text, filePath) {
    fs.writeFile(filePath, encrypt(text.replaceAll(new RegExp('src="data:image.*?\\"', "g"), 'src=""')), function() {writing = false;});
}

function decryptFile(filePath) {
    filePath = filePath;

    // Make sure file exists before trying to decrypt file
    if (fs.existsSync(filePath)) {
        const encString = fs.readFileSync(filePath).toString();
        return decrypt(encString);
    } else {
        return "";
    }
}