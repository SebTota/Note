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
            let fileName = '';
            if (data !== '') {
                //const fileExt = data.split(',')[0].split('/')[1].split(';')[0];
                fileName = `${require('uuid').v4()}.enc`
                //let filePath = cleanPath(`${currentFile['relativePath']}/${currentFile['encAssetsFolder']}/${fileName}`);

                /*
                // Make sure assets directory exists for file
                if (!fs.existsSync(`${currentFile['dirPath']}/${currentFile['encAssetsFolder']}`)) {
                    fs.mkdirSync(`${currentFile['dirPath']}/${currentFile['encAssetsFolder']}`);
                }
                 */

                fs.writeFile(`${assetsPath}/${fileName}`, encrypt(data.toString('base64')), function(err) {
                    if (err) {
                        console.log(err);
                    }
                });
            }

            const node = super.create(data);
            node.setAttribute('src', data);
            node.setAttribute('alt', fileName);

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

// Read local config file
function readConfigFileAsJson() {
    let configFileRaw = fs.readFileSync(configFilePath);
    let configFile = JSON.parse(configFileRaw);

    // Update config variable with updates values
    config['auth_info']['pass_salt'] = configFile['auth_info']['pass_salt'];
    config['auth_info']['key'] = configFile['auth_info']['key'];

    return configFile;
}

// Save config file locally
function writeToConfigFileFromJson(configFile=config) {
    fs.writeFileSync(configFilePath, JSON.stringify(configFile));
}

// Create key from user password and salt
// If no salt is specified, the default salt is used
function createAuthInfo(password, saveConfig=false, salt=defaultSalt) {

    let start = new Date().getTime();
    let key = crypto.scryptSync(password, salt, 32, {
        N: scryptCost,
        r: scryptBlockSize,
        p: scryptParall,
        maxmem: scryptMem
    });
    let end = new Date().getTime();
    console.log("Time for scrypt[ms]: " + (end - start));

    config['auth_info']['pass_salt'] = salt;
    config['auth_info']['key'] = key.toString('base64');

    // Update local config file
    if (saveConfig) {
        writeToConfigFileFromJson();
    }
}

class FolderStructureBuilder {
    constructor() {
        // Hold the current directory structure in dictionary format
        this.dirStructure = {};
        this.getDirStructure();
    }

    checkIfFile(obj) {
        if (obj.type === 'file') {
            try {
                decryptName(obj.name);
            } catch(e) {
                `Cant decrypt file name: ${obj.name}! Not adding to file structure.`;
                return false;
            }
            return true;
        }
        return false;
    }

    getDirStructure(dir=userDataPath) {
        if (typeof(dir) !== 'string') return
        this.dirStructure = dirTree(dir);
        console.log(this.dirStructure)
    }

    buildFileMenuHelper(obj, padding) {
        let menuNode = this.createMenuFolderButton(obj, padding)
        padding += 20; // Indent because it's one folder deeper

        // Add all folders in directory
        for (let i = 0; i < obj['children'].length; i++) {
            if (!this.checkIfFile(obj['children'][i])) {
                menuNode.appendChild(this.buildFileMenuHelper(obj['children'][i], padding))
            }
        }

        // Add all files in directory
        for (let i = 0; i < obj['children'].length; i++) {
            if (this.checkIfFile(obj['children'][i])) {
                menuNode.appendChild(this.createMenuFileButton(obj['children'][i], padding));
            }
        }

        return menuNode;
    }

    buildFileMenu() {
        // Update folder structure
        this.getDirStructure();

        // let menuNode = document.createElement('ul');
        let menuNode = document.createElement('div');

        // Add all folders in current directory
        for (let i = 0; i < this.dirStructure['children'].length; i++) {
            if (!this.checkIfFile(this.dirStructure['children'][i])) {
                menuNode.appendChild(this.buildFileMenuHelper(this.dirStructure['children'][i], 0))
            }
        }

        // Add all files in current directory
        for (let i = 0; i < this.dirStructure['children'].length; i++) {
            if (this.checkIfFile(this.dirStructure['children'][i])) {
                menuNode.appendChild(this.createMenuFileButton(this.dirStructure['children'][i], 0));
            }
        }

        $('#folders').empty(); // Clear current folder structure menu
        document.getElementById('folders').appendChild(menuNode); // Add newly created menu
        console.log('Built folder structure menu.')
    }

    createMenuFolderButton(obj, padding) {
        let folderDiv = document.createElement('div');
        folderDiv.classList.add('div-folder')

        let folderSvgNode = document.createElement('img');
        folderSvgNode.classList.add('folder-svg');
        folderSvgNode.src = 'assets/folder-fill.svg';

        let menuNodeContainer = document.createElement('div');
        menuNodeContainer.height = '100%';
        menuNodeContainer.width = '100%';

        let menuDiv = document.createElement('div');
        menuDiv.classList.add('div-menu-folder');
        menuDiv.classList.add('btn-group');
        menuDiv.classList.add('dropright');

        let menuButton = document.createElement('button');
        menuButton.textContent = decryptName(obj['name']);
        menuButton.classList.add('btn-dir-menu-folder');
        menuButton.style.paddingLeft = padding + 'px';
        menuButton.addEventListener('click', function() {
            $(this).parent().siblings().toggle();
        })
        menuDiv.appendChild(menuButton);

        // Create + button to add new file/folder in folder
        let hiddenMenu = document.createElement('button');
        hiddenMenu.classList.add('btn-hidden-folder-menu');
        hiddenMenu.addEventListener('click', function(e) {

            document.getElementById('add-new-folder').onclick = function() {
                document.getElementById('btn-create-new-folder').onclick = function() {
                    let folderName = document.getElementById('input-new-folder-name').value;
                    newFolderModalHandler(obj['path'].replace(userDataPath, ''), folderName)
                }
                $('#modal-new-folder').modal('show');
            }

            document.getElementById('add-new-file').onclick = function() {
                document.getElementById('btn-create-new-file').onclick = function() {
                    let fileName = document.getElementById('input-new-file-name').value;
                    newFileModalHandler(obj['path'].replace(userDataPath, ''), fileName)
                }
                $('#modal-new-file').modal('show');
            }

            // Places the dropdown at mouse tip
            $('.context-menu').css({
                left: e.pageX,
                top: e.pageY
            });

            // Hide menu if it's already visible
            $('.context-menu').hide();
            // Show menu
            $('.context-menu').slideDown(300);

            // Prevent default action
            return false;
        });

        let hiddenMenuPlus = document.createElement('img');
        hiddenMenuPlus.classList.add('add-svg');
        hiddenMenuPlus.src = 'assets/plus-circle.svg';

        hiddenMenu.appendChild(hiddenMenuPlus);
        menuDiv.appendChild(hiddenMenu);

        menuButton.prepend(folderSvgNode);
        folderDiv.appendChild(menuNodeContainer.appendChild(menuDiv));
        return folderDiv
    }

    createMenuFileButton(obj, padding) {
        let fileSvgNode = document.createElement('img');
        fileSvgNode.style.paddingLeft = '5px';
        fileSvgNode.style.paddingRight = '5px';
        fileSvgNode.src = 'assets/file-earmark-text.svg';

        let fileNode = document.createElement('div');
        fileNode.setAttribute('data-path', obj['path']);
        fileNode.style.width = '100%';
        fileNode.style.height = '35px';

        let fileButton = document.createElement('button');
        fileButton.textContent = decryptName(obj.name);
        fileButton.classList.add('btn-dir-menu-file');
        fileButton.classList.add('btn');
        fileButton.classList.add('btn-light');
        fileButton.style.paddingLeft = padding + 'px';
        fileButton.addEventListener('click', function() {
            openFile(obj['path'].replace(userDataPath, ''));
        })

        fileButton.prepend(fileSvgNode);
        fileNode.appendChild(fileButton)

        return fileNode
    }
}
const folderStructure = new FolderStructureBuilder();

// Clear the new folder modal inputs
function clearModals() {
    document.getElementById('input-new-folder-name').value = '';
    document.getElementById('input-new-file-name').value = '';
}

// Handle new folder creation from modal
function newFolderModalHandler(parentPath, folderName) {
    if (createNewFolder(parentPath + '/' + encryptName(folderName))) {
        folderStructure.buildFileMenu();
    } else {
        console.log('Creating new folder failed. Folder might already exist');
    }
    $('#modal-new-folder').modal('hide');
}

function newFileModalHandler(folderPath, fileName) {
    createNewDocument(folderPath + '/' + encryptName(fileName))
    folderStructure.buildFileMenu();
    $('#modal-new-file').modal('hide');
}

function mainAddBtnEventHandler() {
    document.getElementById('btn-main-add').addEventListener('click', function(e) {

        console.log('btn clicked');

        document.getElementById('add-new-folder').onclick = function() {
            document.getElementById('btn-create-new-folder').onclick = function() {
                let folderName = document.getElementById('input-new-folder-name').value;
                newFolderModalHandler('/', folderName)
            }
            $('#modal-new-folder').modal('show');
        }

        document.getElementById('add-new-file').onclick = function() {
            document.getElementById('btn-create-new-file').onclick = function() {
                let fileName = document.getElementById('input-new-file-name').value;
                newFileModalHandler('/', fileName)
            }
            $('#modal-new-file').modal('show');
        }

        // Places the dropdown at mouse tip
        $('.context-menu').css({
            left: e.pageX,
            top: e.pageY
        });

        // Hide menu if it's already visible
        $('.context-menu').hide();
        // Show menu
        $('.context-menu').slideDown(300);

        // Prevent default action
        return false;
    });
}

function addEventHandlers() {
    mainAddBtnEventHandler()
    // Password input confirmation script
    input_confPassword.addEventListener('keyup', function() {
        console.log(input_password.value === input_confPassword.value);
        if (input_password.value === input_confPassword.value) {
            lable_wrongPassword.style.display = 'none';
        } else {
            lable_wrongPassword.style.display = 'inline';
        }
    })

    /*
    // Random salt generator slider handler
    slider_saltGen.addEventListener('input', function() {
        input_salt.value = crypto.randomBytes(parseInt(slider_saltGen.value)).toString('base64');
        lable_saltGenBytes.textContent = 'Bytes: ' + parseInt(slider_saltGen.value);
    })
     */

    $(document).on('click', function (e) {
        // Hide folder menu if user clicks anywhere
        if (!($(e.target).closest(".btn-hidden-folder-menu").length === 1)) {
            $("#list-folder-menu").hide();
        }
    });

    $("#form-signup").submit(function(e) {
        e.preventDefault();
    });
}

function userAuth() {
    if (input_password.value === input_confPassword.value) {
        const saveConfig = document.getElementById('checkbox-save-config').checked;
        console.log(saveConfig)
        createAuthInfo(input_password.value, saveConfig);

        signupDiv.style.display = 'none';
        appDiv.style.display = 'block';

        // Build file menu now that user has signed in
        folderStructure.buildFileMenu();
    }
}

// Start-up script
function startupConfigInit() {
    addEventHandlers();

    // Check if config file exists on system
    if (!fs.existsSync(configFilePath)) {
        // Config file doesn't exist, ask user to signup/signin
        signupDiv.style.display = 'block';
    } else {
        // Config file already exists on system
        appDiv.style.display = 'block';
        readConfigFileAsJson();
        // Only build file menu if config file is present, else wait for user
        // to sign in before building file menu
        folderStructure.buildFileMenu();
    }
}

startupConfigInit();

function updateEditorFromLocalFile(filePath) {
    try {
        let decStr = decryptFile(filePath);
        quill.clipboard.dangerouslyPasteHTML(decStr, 'api');
    } catch(e) {
        console.log(e);
        quill.clipboard.dangerouslyPasteHTML('Incorrect key used for decryption.', 'api');
        return false
    }

    const currImgs = Array.from(quill.container.firstChild.getElementsByTagName("img"));

    // Find all images, decrypt, and store as base64
    for (let i = 0; i < currImgs.length; i++) {
        try {
            currImgs[i].setAttribute('src', decryptFile(cleanPath(`${assetsPath}/${currImgs[i].getAttribute('alt')}`)));
        } catch (e) {
            console.log(e);
        }
    }

    return true
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
                fs.unlink(cleanPath(`${currentFile['dirPath']}/_assets/${imgPath}`), (err) => {
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

    currentFile['dirPath'] = cleanPath(userDataPath + dirPath);
    currentFile['relativePath'] = cleanPath(dirPath);
    currentFile['fileName'] = cleanPath(dirPath.split("/")[dirPath.split("/").length - 1]);
    currentFile['filePath'] = cleanPath(currentFile['dirPath'] + "/" + currentFile['fileName'] + '.html');

    if (newFile === false) {
        // Check if file exists locally
        if (!fs.existsSync(currentFile['filePath'])){
            console.log("Opening file failed: File doesn't exist locally.")
        } else {
            updateEditorFromLocalFile(currentFile['filePath'])
        }
    }
    $('#input-file-name').val(decryptName(`${currentFile['fileName']}.html`));
    quill.enable(true);
    initSaveFile(currentFile['filePath']);
    return true;
}

function createNewFolder(relativePath) {
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

function createNewDocument(dirPath) {
    currentFile['relativePath'] = dirPath;
    currentFile['fileName'] = dirPath.split("/")[dirPath.split("/").length - 1];
    currentFile['filePath'] = cleanPath(userDataPath + "/" + dirPath);

    if (fs.existsSync(currentFile['filePath'])) {
        console.log("Failed creating new file: File already exists! Trying to open existing file.");
        openFile(dirPath);
        return
    }

    encryptFileToDiskFromStringSync('', currentFile['filePath']);
    openFile(dirPath, true);
}
