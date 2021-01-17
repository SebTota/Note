const dirTree = require("directory-tree");
const {app} = require('electron').remote;

const userDataPath = app.getPath('userData') + "/user/files";

const encryption = require('../modules/encryption');

class FolderStructure {
    constructor() {
        // Hold the current directory structure in dictionary format
        this.dirStructure = {};
        this.getDirStructure();
        this.encryptedNameMapping = {};
        this.mapEncryptedFileNames();
    }

    checkIfFile(obj) {
        if (obj.type === 'file') {
            try {
                encryption.decryptName(obj.name);
            } catch(e) {
                `Cant decrypt file name: ${obj.name}! Not adding to file structure.`;
                return false;
            }
            return true;
        }
        return false;
    }

    checkIfFolder(obj) {
        if (obj.type === 'directory') {
            try {
                encryption.decryptName(obj.name);
            } catch(e) {
                `Cant decrypt file directory: ${obj.name}! Not adding to file structure.`;
                return false;
            }
            return true;
        }
        return false;
    }

    getDirStructure(dir=userDataPath) {
        if (typeof(dir) !== 'string') return
        this.dirStructure = dirTree(dir);
    }

    mapEncryptedFileNames(dirStructLevel = this.dirStructure) {
        for (let i = 0; i < dirStructLevel['children'].length; i++) {
            if (this.checkIfFile(dirStructLevel['children'][i])) {
                this.encryptedNameMapping[encryption.decryptPath(dirStructLevel['children'][i]['path'])] =
                    dirStructLevel['children'][i]['path'];
            } else if (this.checkIfFolder(dirStructLevel['children'][i])) {
                this.mapEncryptedFileNames(dirStructLevel['children'][i]);
            }
        }
    }

    buildFileMenuHelper(obj, padding) {
        let menuNode = this.createMenuFolderButton(obj, padding)
        padding += 20; // Indent because it's one folder deeper

        // Add all folders in directory
        for (let i = 0; i < obj['children'].length; i++) {
            if (this.checkIfFolder(obj['children'][i])) {
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
            if (this.checkIfFolder(this.dirStructure['children'][i])) {
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

    createMenuFileButton(obj, padding) {
        let fileSvgNode = document.createElement('img');
        fileSvgNode.style.paddingLeft = '5px';
        fileSvgNode.style.paddingRight = '5px';
        fileSvgNode.src = '../assets/file-earmark-text.svg';

        let fileNode = document.createElement('div');
        fileNode.setAttribute('data-path', obj['path']);
        fileNode.style.width = '100%';
        fileNode.style.height = '35px';

        let fileButton = document.createElement('button');
        fileButton.textContent = encryption.decryptName(obj.name);
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

// Make sure only one config object can ever exist
if (!global.directoryHandler) {
    global.directoryHandler = new FolderStructure();
    module.exports = directoryHandler;
} else {
    module.exports = global.directoryHandler;
}

