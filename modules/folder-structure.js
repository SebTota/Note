const dirTree = require("directory-tree");
const {app} = require('electron').remote;

const userDataPath = app.getPath('userData') + "/user/files";
const userAssetPath = app.getPath('userData') + "/user/assets";

const encryption = require('../modules/encryption');

const ignoreFiles = ['.DS_Store'];

class FolderStructure {
    constructor() {
        // Hold the current directory structure in dictionary format
        this.dirStructure = {};

        /*
        * Maps the encrypted file path to the encrypted path and modification time of the file
         */
        this.files = {};
        this.folders = {};
        this.assets = {};
    }

    checkIfFileExists(relativePath) {
        relativePath.replace(userDataPath, '');
        return relativePath in this.files
    }

    checkIfFolderExists(relativePath) {
        relativePath.replace(userDataPath, '');
        return relativePath in this.folders
    }

    // Returns directory item (folder or file) decrypted name, or undefined if it can't be decrypted with the users key
    getDirItemName(dirItem) {
        let itemName = '';
        try {
            itemName = encryption.decryptName(dirItem.name);
        } catch(e) {
            logger.warn(`Cant decrypt directory item: ${dirItem.name}. Not added to file structure.`);
            return undefined;
        }
        return itemName;
    }

    getDirStructure(dir=userDataPath) {
        if (typeof(dir) !== 'string') return
        this.dirStructure = dirTree(dir, {attributes: ['mtime']});
        this.mapEncryptedFileNames();
        this.getAssetFiles();
    }

    mapEncryptedFileNames(dirStructLevel = this.dirStructure) {
        dirStructLevel['children'].forEach(dirItem => {
            let itemName = this.getDirItemName(dirItem);
            if (itemName === undefined) return  // Skip directory item if it can't be decrypted with the users key

            // Create DOM element based on if the directory item is a file or folder
            if (dirItem.type === 'file') {
                this.files[encryption.decryptPath(dirItem.path).replace(userDataPath, '')] =
                    {'path': dirItem.path.replace(userDataPath, ''),
                        'mtime': new Date(dirItem.mtime).toISOString()};
            } else if (dirItem.type === 'directory') {
                this.folders[encryption.decryptPath(dirItem.path).replace(userDataPath, '')] =
                    dirItem.path.replace(userDataPath, '');
                this.mapEncryptedFileNames(dirItem);
            }
        })
    }

    getAssetFiles() {
        const assetFiles = dirTree(userAssetPath, {attributes: ['mtime']});
        assetFiles.children.forEach((file) => {
            if (!ignoreFiles.includes(file.name)) {
                this.assets[encryption.decryptPath(file.name)] = {
                    'path': file.path.replace(userAssetPath, ''),
                    'mtime': new Date(file.mtime).toISOString()
                }
            }
        })
    }

    buildFileMenuHelper(obj, padding) {
        let menuNode = this.createMenuFolderButton(obj, padding);
        padding += 20; // Indent left side padding to indicate a level deeper in directory

        // Create an array of elements holding all the files and folders within this directory level
        let files = [];
        let folders = [];

        obj['children'].forEach(dirItem => {
            let itemName = this.getDirItemName(dirItem);
            if (itemName === undefined) return  // Skip directory item if it can't be decrypted with the users key

            // Create DOM element based on if the directory item is a file or folder
            if (dirItem.type === 'file') {
                files.push(this.createMenuFileButton(dirItem.name, dirItem.path, padding));
            } else if (dirItem.type === 'directory') {
                folders.push(this.buildFileMenuHelper(dirItem, padding));
            }
        })

        // Sort the files and folders at the current directory level in alphabetical order
        if (files.length > 0)
            files.sort((a, b) => (a.getAttribute('data-name').localeCompare(b.getAttribute('data-name'))));

        if (folders.length > 0)
            folders.sort((a, b) => (a.getAttribute('data-name').localeCompare(b.getAttribute('data-name'))));

        // Append all folders and files to the directory structure at the current level
        // Add folders first so they appear at the top of the structure
        folders.forEach(folder => {
            menuNode.appendChild(folder)
        })

        files.forEach(file => {
            menuNode.appendChild(file)
        })

        // Return the DOM element holding the current level of the directory structure and all the children
        return menuNode;
    }

    buildFileMenu() {
        // Update folder structure
        this.getDirStructure();

        // let menuNode = document.createElement('ul');
        let menuNode = document.createElement('div');

        // Create an array of elements holding all the files and folders within this directory level
        let files = [];
        let folders = [];

        this.dirStructure['children'].forEach(dirItem => {
            let itemName = this.getDirItemName(dirItem);
            if (itemName === undefined) return  // Skip directory item if it can't be decrypted with the users key

            // Create DOM element based on if the directory item is a file or folder
            if (dirItem.type === 'file') {
                files.push(this.createMenuFileButton(dirItem.name, dirItem.path, 0));
            } else if (dirItem.type === 'directory') {
                folders.push(this.buildFileMenuHelper(dirItem, 0))
            }
        })

        // Sort the files and folders at the current directory level in alphabetical order
        if (files.length > 0)
            files.sort((a, b) => (a.getAttribute('data-name').localeCompare(b.getAttribute('data-name'))));

        if (folders.length > 0)
            folders.sort((a, b) => (a.getAttribute('data-name').localeCompare(b.getAttribute('data-name'))));

        // Append all folders and files to the directory structure at the current level
        // Add folders first so they appear at the top of the structure
        folders.forEach(folder => {
            menuNode.appendChild(folder)
        })

        files.forEach(file => {
            menuNode.appendChild(file)
        })

        $('#folders').empty(); // Clear current folder structure menu
        document.getElementById('folders').appendChild(menuNode); // Add newly created menu
        logger.info(`Finished building folder structure element`);
    }

    updateGUIFileMenuItem(currentRelativePath, newRelativePath) {
        if (typeof(currentRelativePath) !== 'string' || typeof(newRelativePath) !== 'string') {
            logger.error('Error updating GUI file menu item: One of the paths specified was not a valid string');
        }

        // Make sure paths are relative paths rather than complete paths
        currentRelativePath.replace(userDataPath, '');
        newRelativePath.replace(userDataPath, '');

        let newName = newRelativePath.split('/').pop();

        let currentElement = $(`[data-path='${currentRelativePath}']`);
        let curElementPadding = parseInt(currentElement.children().first().css('padding-left').replace('px', ''))
        let newElement = this.createMenuFileButton(newName, newRelativePath, curElementPadding)
        currentElement.replaceWith(newElement)
        logger.info(`Replaced file GUI element`)
    }

    createMenuFolderButton(obj, padding) {
        let folderDiv = document.createElement('div');
        folderDiv.classList.add('div-folder')
        folderDiv.setAttribute('data-name', encryption.decryptName(obj['name']))

        let folderSvgNode = document.createElement('img');
        folderSvgNode.classList.add('folder-svg');
        folderSvgNode.src = '../assets/folder-fill.svg';

        let menuNodeContainer = document.createElement('div');
        menuNodeContainer.height = '100%';
        menuNodeContainer.width = '100%';

        let menuDiv = document.createElement('div');
        menuDiv.classList.add('div-menu-folder');
        menuDiv.classList.add('btn-group');
        menuDiv.classList.add('dropright');

        let menuButton = document.createElement('button');
        menuButton.textContent = encryption.decryptName(obj['name']);
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
        hiddenMenuPlus.src = '../assets/plus-circle.svg';

        hiddenMenu.appendChild(hiddenMenuPlus);
        menuDiv.appendChild(hiddenMenu);

        menuButton.prepend(folderSvgNode);
        folderDiv.appendChild(menuNodeContainer.appendChild(menuDiv));
        return folderDiv
    }

    createMenuFileButton(title, path, padding) {
        let fileSvgNode = document.createElement('img');
        fileSvgNode.style.paddingLeft = '5px';
        fileSvgNode.style.paddingRight = '5px';
        fileSvgNode.src = '../assets/file-earmark-text.svg';

        let fileNode = document.createElement('div');
        fileNode.setAttribute('data-path', path.replace(userDataPath, ''));
        fileNode.setAttribute('data-name', encryption.decryptName(title));
        fileNode.style.width = '100%';
        fileNode.style.height = '35px';

        let fileButton = document.createElement('button');
        fileButton.textContent = encryption.decryptName(title);
        fileButton.classList.add('btn-dir-menu-file');
        fileButton.classList.add('btn');
        fileButton.classList.add('btn-light');
        fileButton.style.paddingLeft = padding + 'px';
        fileButton.addEventListener('click', function() {
            openFile(path.replace(userDataPath, ''));
        })

        fileButton.prepend(fileSvgNode);
        fileNode.appendChild(fileButton)

        return fileNode
    }

    createNewFolder(relativePath) {
        // Check if directory already exists
        if (fs.existsSync((userDataPath + "/" + relativePath).replaceAll('//', '/'))) {
            logger.error(`Failed creating new folder at ${relativePath}. Folder may already exist.`)
        } else {
            fs.mkdirSync((userDataPath + "/" + relativePath).replaceAll('//', '/'));
            logger.info(`Created new folder at ${relativePath}`)
            this.buildFileMenu();
        }
    }
}

// Make sure only one config object can ever exist
if (!global.directoryHandler) {
    global.directoryHandler = new FolderStructure();
    module.exports = directoryHandler;
} else {
    module.exports = global.directoryHandler;
}

