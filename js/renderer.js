var quill;

function initQuill() {
    hljs.configure({   // optionally configure hljs
        languages: ['javascript', 'python', 'html']
    });
    // Fixed error with image local src not passing sanitization
    var Image = Quill.import('formats/image');
    Image.sanitize = function(url) {
        return url;
    };

    // Add 'alt' value to image (used for encrypting the image locally and storing the local path)
    class CustomImage extends Image {
        static create(data) {
            let filePath = "";
            if (data !== "") {
                const fileExt = data.split(',')[0].split('/')[1].split(';')[0];
                const fileName = require('uuid').v4() + "." + fileExt;
                filePath = currentFile['relativePath'] + "/assets/" + fileName + ".enc";

                // Make sure assets directory exists for file
                if (!fs.existsSync(currentFile['dirPath'] + "/assets")) {
                    fs.mkdirSync(currentFile['dirPath'] + "/assets");
                }

                fs.writeFile(userDataPath + "/" + filePath, encrypt(data.toString('hex')), function(err) {
                    if (err) {
                        console.log(err);
                    }
                });
            }

            const node = super.create(data);
            node.setAttribute('src', data);
            node.setAttribute('alt', filePath);

            return node;

        }
    }
    Quill.register(CustomImage, true);

    var toolbarOptions = [
        ['bold', 'italic', 'underline', 'strike'],        // toggled buttons
        ['blockquote', 'code-block'],

        [{ 'header': 1 }, { 'header': 2 }],               // custom button values
        [{ 'list': 'ordered'}, { 'list': 'bullet' }, { 'list': 'check' }],
        [{ 'script': 'sub'}, { 'script': 'super' }],      // superscript/subscript
        [{ 'indent': '-1'}, { 'indent': '+1' }],          // outdent/indent
        [{ 'direction': 'rtl' }],                         // text direction
        [ 'link'],

        [{ 'header': [1, 2, 3, 4, 5, 6, false] }],

        [{ 'color': [] }, { 'background': [] }],          // dropdown with defaults from theme
        [{ 'align': [] }],

        ['clean']                                         // remove formatting button
    ];

    quill = new Quill('#editor', {
        modules: {
            syntax: true,
            imageResize: {
                displaySize: true
            },
            imageDrop: true,
            toolbar: toolbarOptions
        },
        placeholder: 'Choose file to start writing...',
        theme: 'snow'
    })
    quill.enable(false);
}
initQuill();

const editor = document.querySelector('.ql-editor');

// Remove extra backslashes in path
function cleanPath(path) {
    return path.replace(/([^:]\/)\/+/g, "$1");
}

function updateEditorFromLocalFile(filePath) {
    // Check if file exists locally
    if (!fs.existsSync(filePath)){
        console.log("Opening file failed: File doesn't exist locally.")
        return
    }

    let decStr = decryptFile(filePath);
    console.log(decStr[0])
    if (decStr[0] === true) {
        quill.clipboard.dangerouslyPasteHTML(decStr[1], 'api');
        const currImgs = Array.from(quill.container.firstChild.getElementsByTagName("img"));

        // Find all images, decrypt, and store as base64
        for (let i = 0; i < currImgs.length; i++) {
            currImgs[i].setAttribute('src', decryptFile(userDataPath + "/" + currImgs[i].getAttribute('alt')));
        }
        return true
    } else {
        quill.clipboard.dangerouslyPasteHTML('Incorrect key used for decryption.', 'api');
        return false
    }

}

function imageHandler(delta, oldDelta, source) {
    let currrentContents = quill.getContents();
    let diff = currrentContents.diff(oldDelta);

    const currImgs = Array.from(quill.container.firstChild.getElementsByTagName("img"));
    const currImgsSrc = []

    // Confirm image deletion
    currImgs.forEach(img => {
        currImgsSrc.push(img.alt);
    })

    for (let i = 0; i < diff.ops.length; i++) {
        if (diff.ops[i].hasOwnProperty('attributes') && diff.ops[i]['attributes']['alt']) {
            // Image has been deleted
            const imgPath = diff.ops[i]['attributes']['alt'];

            if (!currImgsSrc.includes(imgPath)) {
                // Delete image locally
                fs.unlink(userDataPath + "/" + decodeURI(imgPath), (err) => {
                    if (err) throw err;
                    console.log('Image deleted from local folder');
                });
            }
        }
    }
}

function initSaveFile(filePath) {
    if (document) {
        this.quill.on('text-change', (delta, oldDelta, source) => {
            if (!writing) {
                writing = true;
                imageHandler(delta, oldDelta, source);
                encryptFileToDiskFromString(editor.innerHTML, filePath)
            }
        });
    }
}

function openFile(dirPath, newFile=false) {
    quill.enable(false);
    // Resent on text-change event if one exists
    this.quill['emitter']['_events']['text-change'] = undefined;

    currentFile['dirPath'] = userDataPath + dirPath;
    currentFile['relativePath'] = dirPath;
    currentFile['fileName'] = dirPath.split("/")[dirPath.split("/").length - 1];
    currentFile['filePath'] = currentFile['dirPath'] + "/" + currentFile['fileName'] + ".enc";

    if (newFile === false) {
        if (!updateEditorFromLocalFile(currentFile['filePath'])) {
            return;
        }
    }
    quill.enable(true);
    initSaveFile(currentFile['filePath']);
    return true;
}

function newFolder(relativePath) {
    // Check if directory already exists
    if (fs.existsSync(userDataPath + "/" + relativePath)){
        console.log("Failed creating new folder. Folder already exists!")
        return false;
    } else {
        fs.mkdirSync(userDataPath + "/" + relativePath);
        console.log("New folder created!");
        return true
    }

}

function newFile(dirPath) {
    currentFile['relativePath'] = cleanPath(dirPath);
    currentFile['dirPath'] = cleanPath(userDataPath + "/" + dirPath);
    currentFile['fileName'] = cleanPath(dirPath.split("/")[dirPath.split("/").length - 1]);
    currentFile['filePath'] = cleanPath(currentFile['dirPath'] + "/" + currentFile['fileName'] + ".enc");

    // Check if directory already exists
    if (!fs.existsSync(currentFile['dirPath'])) {
        fs.mkdirSync(currentFile['dirPath']);
    }

    // Check if directory already exists
    if (!fs.existsSync(currentFile['dirPath']) + "/assets") {
        fs.mkdirSync(currentFile['dirPath'] + "/assets");
    }

    if (fs.existsSync(currentFile['filePath'])) {
        console.log("Failed creating new file: File already exists! Trying to open existing file.");
        openFile(dirPath);
        return
    }

    encryptFileToDiskFromStringSync('', currentFile['filePath']);
    openFile(dirPath, true);
}
