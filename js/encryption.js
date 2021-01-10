function encrypt(text, key=config['auth_info']['key'], encoding='base64') {
    if (key === null) return

    let startTime = new Date().getTime();
    let iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv);

    let enc = cipher.update(text, 'utf8', encoding);
    enc += cipher.final(encoding);

    console.log(`Encrypt time[ms]: ${(new Date().getTime()) - startTime}`)

    console.log(iv.toString(encoding))

    return iv.toString(encoding) + cipher.getAuthTag().toString(encoding) + enc;
}

function encryptName(text, key=config['auth_info']['key']) {
    console.log("Encrypt: " + encrypt(text, key, encoding='hex'))
    return encrypt(text, key, encoding='hex')
}

// Return: string -> decypted text
function decrypt(text, key=config['auth_info']['key']) {
    if (text === null) return

    let startTime = new Date().getTime();

    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'base64'), Buffer.from(text.substring(0, 24), 'base64'));
    decipher.setAuthTag(Buffer.from(text.substring(24, 48), 'base64'));

    let decryptedStr = decipher.update(text.substring(start=48), 'base64', 'utf8');
    try {
        decryptedStr += decipher.final('utf8');
    } catch(e) {
        throw IncorrectDecryptionKeyError;
    }
    console.log(`Decrypt time[ms]: ${(new Date().getTime()) - startTime}`)
    return decryptedStr
}

function decryptName(text, key=config['auth_info']['key']) {
    let base64Str = Buffer.from(text.substring(0, 32), 'hex').toString('base64') +
        Buffer.from(text.substring(32, 64), 'hex').toString('base64') +
        Buffer.from(text.substring(start=64), 'hex').toString('base64');
    console.log(base64Str)

    return decrypt(base64Str, key);
}

function encryptFileToDiskFromStringSync(text, filePath) {
    fs.writeFileSync(filePath, encrypt(text.replaceAll(new RegExp('src="data:image.*?\\"', "g"), 'src=""')));
}

async function encryptFileToDiskFromString(text, filePath) {
    fs.writeFile(filePath, encrypt(text.replaceAll(new RegExp('src="data:image.*?\\"', "g"), 'src=""')), function() {writing = false;});
}

function decryptFile(filePath) {
    if (fs.existsSync(filePath)) {
        return decrypt(fs.readFileSync(filePath).toString());
    } else {
        console.log(`Not found: ${filePath}`)
        throw MissingFileError
    }
}