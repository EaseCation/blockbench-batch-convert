Plugin.register('batch-convert', {
    title: 'Batch Convert',
    author: 'boybook',
    icon: 'icon-format_bedrock',
    description: 'Select a folder and you can easily batch convert all the models in the folder.',
    version: '1.0.0',
    variant: 'desktop',
    onload() {
        Language.addTranslations("en", {
            "batch_convert.title": "Batch Convert",
            "batch_convert.title.folder": "Batch Convert from Folder",
            "batch_convert.intro": "Select a folder and you can easily batch convert all the models in the folder.",
            "batch_convert.intro.folder": "Select a folder, automatically recognize the internal file structure, and convert the model to the appropriate directory. (Always place the output folder in the resourcepacks folder)",
            "batch_convert.source_folder": "Source folder",
            "batch_convert.target_format": "Target format",
            "batch_convert.export_to": "Export to",
            "batch_convert.keep_open": "Open projects",
            "batch_convert.copy_texture": "Copy textures",
            "batch_convert.missing_args.title": "Missing arguments",
            "batch_convert.missing_args.message": "Please select a folder and a target format.",
            "batch_convert.processing": "Processing...",
            "batch_convert.success": "Convert success",
            "batch_convert.error": "Convert error",
            "batch_screenshot.title": "Batch Screenshot",
            "batch_screenshot.intro": "Select a folder containing model files, and automatically take screenshots of each model.",
            "batch_screenshot.source_folder": "Source Folder",
            "batch_screenshot.export_folder": "Screenshot Output Folder",
            "batch_screenshot.width": "Screenshot Width",
            "batch_screenshot.height": "Screenshot Height",
            "batch_screenshot.keep_open": "Keep Project Open",
            "batch_screenshot.missing_args.title": "Missing Arguments",
            "batch_screenshot.missing_args.message": "Please select an input folder and an output folder.",
            "batch_screenshot.processing": "Taking screenshots...",
            "batch_screenshot.success": "Screenshots finished",
            "batch_screenshot.error": "Screenshot error",
        });
        Language.addTranslations("zh", {
            "batch_convert.title": "批量转换",
            "batch_convert.title.folder": "自动从目录批量转换",
            "batch_convert.intro": "选择一个文件夹，方便地批量转换文件夹中的所有模型，并保留原来的目录结构。",
            "batch_convert.intro.folder": "选择一个文件夹，自动识别内部的文件结构，将模型转码到合适的目录。（始终将输出文件夹放在resourcepacks文件夹中）",
            "batch_convert.source_folder": "源文件夹",
            "batch_convert.target_format": "目标格式",
            "batch_convert.export_to": "导出到(可选)",
            "batch_convert.keep_open": "打开项目",
            "batch_convert.copy_texture": "复制贴图",
            "batch_convert.missing_args.title": "缺少参数",
            "batch_convert.missing_args.message": "请选择一个文件夹和一个目标格式。",
            "batch_convert.processing": "正在转换...",
            "batch_convert.success": "转换成功",
            "batch_convert.error": "转换失败",
            "batch_screenshot.title": "批量截图",
            "batch_screenshot.intro": "选择一个含有模型的文件夹，可批量为每个模型进行截图。",
            "batch_screenshot.source_folder": "模型文件夹",
            "batch_screenshot.export_folder": "截图输出文件夹",
            "batch_screenshot.width": "截图宽度",
            "batch_screenshot.height": "截图高度",
            "batch_screenshot.keep_open": "保持项目打开",
            "batch_screenshot.missing_args.title": "缺少参数",
            "batch_screenshot.missing_args.message": "请选择输入文件夹以及截图输出文件夹",
            "batch_screenshot.processing": "正在批量截图...",
            "batch_screenshot.success": "截图完成",
            "batch_screenshot.error": "截图出错",
        });

        const separator = process.platform === 'win32' ? '\\' : '/';

        /**
         * 遍历dir所有子目录，找出所有的json文件，返回绝对路径
         */
        const walk = (dir) => {
            return new Promise((resolve, reject) => {
                let results = [];
                fs.readdir(dir, (err, list) => {
                    if (err) return reject(err);
                    let pending = list.length;
                    if (!pending) return resolve(results);
                    list.forEach((file) => {
                        file = dir + separator + file; // 使用字符串拼接代替 path.resolve
                        fs.stat(file, async (err, stat) => {
                            if (stat && stat.isDirectory()) {
                                try {
                                    let res = await walk(file);
                                    results = results.concat(res);
                                } catch (e) {
                                    reject(e);
                                }
                                if (!--pending) resolve(results);
                            } else {
                                if (file.slice(-5) === '.json') { // 使用字符串切片代替 path.extname
                                    results.push(file);
                                } else if (file.slice(-8) === '.bbmodel') {
                                    results.push(file);
                                }
                                if (!--pending) resolve(results);
                            }
                        });
                    });
                });
            });
        }

        // 只遍历所有的文件夹，不遍历文件
        const walkDir = (dir) => {
            return new Promise((resolve, reject) => {
                let results = [];
                fs.readdir(dir, (err, list) => {
                    if (err) return reject(err);
                    let pending = list.length;
                    if (!pending) return resolve(results);
                    list.forEach((file) => {
                        file = dir + separator + file; // 使用字符串拼接代替 path.resolve
                        fs.stat(file, async (err, stat) => {
                            if (stat && stat.isDirectory()) {
                                results.push(file);
                                try {
                                    let res = await walkDir(file);
                                    results = results.concat(res);
                                } catch (e) {
                                    reject(e);
                                }
                                if (!--pending) resolve(results);
                            } else {
                                if (!--pending) resolve(results);
                            }
                        });
                    });
                });
            });
        }

        /**
         * 加载模型文件
         * Code from Blockbench
         * @param file FileResult
         */
        const loadModelFile = (file) => {
            function pathToExtension(path) {
                if (typeof path !== 'string') return '';
                const matches = path.match(/\.\w{2,24}$/)
                if (!matches || !matches.length) return '';
                return matches[0].replace('.', '').toLowerCase()
            }

            let existing_tab = isApp && ModelProject.all.find(project => (
                project.save_path === file.path || project.export_path === file.path
            ))

            let extension = pathToExtension(file.path);

            function loadIfCompatible(codec, type, content) {
                if (codec.load_filter && codec.load_filter.type === type) {
                    if (codec.load_filter.extensions.includes(extension) && Condition(codec.load_filter.condition, content)) {
                        if (existing_tab && !codec.multiple_per_file) {
                            existing_tab.select();
                        } else {
                            codec.load(content, file);
                        }
                        return true;
                    }
                }
            }

            /**
             * Code from Blockbench
             * @param data
             * @param feedback
             * @returns {*}
             */
            function autoParseJSON(data, feedback) {
                if (data.substr(0, 4) === '<lz>') {
                    data = LZUTF8.decompress(data.substr(4), {inputEncoding: 'StorageBinaryString'})
                }
                if (data.charCodeAt(0) === 0xFEFF) {
                    data = data.substr(1)
                }
                try {
                    data = JSON.parse(data)
                } catch (err1) {
                    data = data.replace(/\/\*[^(*\/)]*\*\/|\/\/.*/g, '')
                    try {
                        data = JSON.parse(data)
                    } catch (err) {
                        if (feedback === false) return;
                        let error_part = '';
                        function logErrantPart(whole, start, length) {
                            let line = whole.substr(0, start).match(/\n/gm);
                            line = line ? line.length+1 : 1
                            let result = '';
                            const lines = whole.substr(start, length).split(/\n/gm);
                            lines.forEach((s, i) => {
                                result += `#${line+i} ${s}\n`
                            })
                            error_part = result.substr(0, result.length-1) + ' <-- HERE';
                            console.log(error_part);
                        }
                        console.error(err)
                        let length = err.toString().split('at position ')[1];
                        if (length) {
                            length = parseInt(length)
                            const start = limitNumber(length - 32, 0, Infinity);

                            logErrantPart(data, start, 1+length-start)
                        } else if (err.toString().includes('Unexpected end of JSON input')) {

                            logErrantPart(data, data.length-16, 10)
                        }
                        Blockbench.showMessageBox({
                            translateKey: 'invalid_file',
                            icon: 'error',
                            message: tl('message.invalid_file.message', [err]) + (error_part ? `\n\n\`\`\`\n${error_part}\n\`\`\`` : '')
                        })
                        return;
                    }
                }
                return data;
            }

            // Image
            for (let id in Codecs) {
                let success = loadIfCompatible(Codecs[id], 'image', file.content);
                if (success) return;
            }
            // Text
            for (let id in Codecs) {
                let success = loadIfCompatible(Codecs[id], 'text', file.content);
                if (success) return;
            }
            // JSON
            let model = autoParseJSON(file.content);
            for (let id in Codecs) {
                let success = loadIfCompatible(Codecs[id], 'json', model);
                if (success) return;
            }
        }
        /**
         * 处理文件并进行转换
         * @param folder string 原始文件夹路径
         * @param fileResults FileResult[]
         * @param formatType string
         * @param saveTo string
         * @param keepOpen boolean
         * @returns {Promise<void>}
         */
        const processFiles = async (folder, fileResults, formatType, saveTo, keepOpen, copyTexture) => {
            console.log("processFiles", fileResults, formatType, saveTo);
            let index = 0;
            for (let file of fileResults) {
                try {
                    // 遍历results，计算每个文件对于folder的相对路径
                    loadModelFile(file);
                    const format = Formats[formatType];
                    format.convertTo();
                    const codec = format.codec;

                    // 拼接出一个保存到的绝对路径，需要包括file.path去除原绝对路径的部分
                    // 处理file.relative_path，去除文件名本身，只保留文件夹路径
                    const relative_path = file.path.replace(folder, '').replace(file.name, '');
                    const save_path_dir = saveTo + relative_path;
                    const save_path = save_path_dir + codec.fileName() + '.' + codec.extension;

                    if (!fs.existsSync(save_path_dir)) {
                        fs.mkdirSync(save_path_dir, {recursive: true});
                    }
                    Blockbench.writeFile(save_path, {content: codec.compile()}, path => codec.afterSave(path));

                    // 复制贴图
                    if (copyTexture) {
                        for (let texture of Texture.all) {
                            const path = texture.path;
                            const name = texture.name;
                            const relative_path = path.replace(folder, '').replace(name, '');
                            const save_path_dir = saveTo + relative_path;
                            const save_path = save_path_dir + name;
                            fs.mkdirSync(save_path_dir, {recursive: true});
                            // 从原始目录复制到目标目录
                            fs.copyFileSync(path, save_path);
                            texture.fromPath(save_path);
                        }
                    }

                    if (!keepOpen && Project) {
                        await Project.close(true);
                    }
                    index++;
                    Blockbench.setProgress(Math.min(1, index / fileResults.length));
                } catch (e) {
                    console.error(e);
                }
            }
        }

        /**
         * 执行转换
         * @param folder 文件夹路径
         * @param format 目标格式
         * @param saveTo 导出到
         * @param keepOpen 保持项目打开
         * @returns {Promise<void>}
         */
        const doConvert = async (folder, format, saveTo, keepOpen, copyTexture) => {
            console.log("doConvert", folder, format, saveTo, copyTexture);
            // 遍历folder，获得里面的所有的json文件的绝对路径
            const files = await walk(folder);
            Blockbench.read(files, {
                readtype: 'text',
                errorbox: true
            }, (results) => {
                if (!saveTo) {
                    // 设置为folder的父目录
                    saveTo = folder.split(separator).slice(0, -1).join(separator);
                }
                // 判断save_to是否为空
                if (!fs.existsSync(saveTo)) {
                    fs.mkdirSync(saveTo, {recursive: true});
                }
                if (fs.readdirSync(saveTo).length > 0) {
                    // 先在save_to目录创建一个与folder文件夹带后缀的新文件夹
                    saveTo = saveTo + separator + folder.split(separator).pop() + '_converted';
                    fs.mkdirSync(saveTo, {recursive: true});
                }
                processFiles(folder, results, format, saveTo, keepOpen, copyTexture)
                    .then(() => Blockbench.setProgress(-1))
                    .catch((e) => {
                        console.error(e);
                        Blockbench.showMessageBox({
                            title: "batch_convert.error",
                            icon: "warning",
                            message: e.message,
                        });
                        Blockbench.setProgress(-1);
                    });
            })
        }
        const action = new Action("batch-convert", {
            name: "batch_convert.title",
            description: "batch_convert.intro",
            icon: "icon-format_bedrock",
            condition: () => true,
            click: () => {
                const options = {};
                for (let key in Formats) {
                    let format = Formats[key]
                    if (format.can_convert_to) {
                        options[key] = format.name;
                    }
                }
                const localStorageConfig = JSON.parse(localStorage.getItem('batchconvert')) || {};
                new Dialog("batch-convert-dialog", {
                    title: "batch_convert.title",
                    id: "batch-convert-dialog",
                    form: {
                        text1: {
                            type: "info",
                            text: "batch_convert.intro"
                        },
                        folder: {
                            type: 'folder',
                            label: 'batch_convert.source_folder',
                            value: localStorageConfig['lastSourceFolder'] || ''
                        },
                        format: {
                            type: 'select',
                            label: 'batch_convert.target_format',
                            options,
                            value: localStorageConfig['lastTargetFormat'] || "bedrock_block"
                        },
                        save_to: {
                            type: 'folder',
                            label: 'batch_convert.export_to',
                            value: localStorageConfig['lastExportTo'] || ''
                        },
                        keep_open: {
                            type: 'checkbox',
                            label: 'batch_convert.keep_open',
                            value: localStorageConfig['lastKeepOpen'] || false
                        },
                        copy_texture: {
                            type: 'checkbox',
                            label: 'batch_convert.copy_texture',
                            value: localStorageConfig['lastCopyTexture'] || false
                        }
                    },
                    onConfirm: async function(formResult) {
                        if (!formResult.folder || !formResult.format) {
                            Blockbench.showMessageBox({
                                title: "batch_convert.missing_args.title",
                                icon: "warning",
                                message: "batch_convert.missing_args.message",
                            });
                            return;
                        }
                        try {
                            // 存储用户选择的目录到localStorage
                            localStorage.setItem('batchconvert', JSON.stringify({
                                lastSourceFolder: formResult.folder,
                                lastTargetFormat: formResult.format,
                                lastExportTo: formResult.save_to,
                                lastKeepOpen: formResult.keep_open,
                                lastCopyTexture: formResult.copy_texture
                            }));
                            Blockbench.showQuickMessage("batch_convert.processing");
                            await doConvert(formResult.folder, formResult.format, formResult.save_to, formResult.keep_open, formResult.copy_texture);
                            Blockbench.showMessageBox({
                                title: "batch_convert.success",
                                icon: "info",
                                message: "batch_convert.success",
                            });
                        } catch (e) {
                            console.error(e);
                            Blockbench.showMessageBox({
                                title: "batch_convert.error",
                                icon: "warning",
                                message: e.message,
                            });
                        }
                    }
                    /*component: {
                        template: `
                            <div>
                              <h2>Batch Convert</h2>
                              <button @click="toggle">TEST {{test}}</button>
                              <input type="file" multiple @change="toggle">
                              <input type="text" v-model="text">
                            </div>
                        `,
                        data: {
                            test: false,
                            text: "TEST"
                        },
                        methods: {
                            toggle() {
                                this.test = !this.test;
                            }
                        }
                    }*/
                }).show();
            }
        })
        const actionFolder = new Action("batch-convert", {
            name: "batch_convert.title.folder",
            description: "batch_convert.intro.folder",
            icon: "icon-format_bedrock",
            condition: () => true,
            click: () => {
                const options = {};
                for (let key in Formats) {
                    let format = Formats[key]
                    if (format.can_convert_to) {
                        options[key] = format.name;
                    }
                }
                const localStorageConfig = JSON.parse(localStorage.getItem('batchconvert_folder')) || {};
                new Dialog("batch-convert-dialog", {
                    title: "batch_convert.title",
                    id: "batch-convert-dialog",
                    form: {
                        text1: {
                            type: "info",
                            text: "batch_convert.intro.folder"
                        },
                        folder: {
                            type: 'folder',
                            label: 'batch_convert.source_folder',
                            value: localStorageConfig['lastSourceFolder'] || ''
                        },
                        format: {
                            type: 'select',
                            label: 'batch_convert.target_format',
                            options,
                            value: localStorageConfig['lastTargetFormat'] || "bedrock_block"
                        },
                        keep_open: {
                            type: 'checkbox',
                            label: 'batch_convert.keep_open',
                            value: localStorageConfig['lastKeepOpen'] || false
                        },
                        copy_texture: {
                            type: 'checkbox',
                            label: 'batch_convert.copy_texture',
                            value: localStorageConfig['lastCopyTexture'] || false
                        }
                    },
                    onConfirm: async function(formResult) {
                        if (!formResult.folder || !formResult.format) {
                            Blockbench.showMessageBox({
                                title: "batch_convert.missing_args.title",
                                icon: "warning",
                                message: "batch_convert.missing_args.message",
                            });
                            return;
                        }
                        try {
                            // 存储用户选择的目录到localStorage
                            localStorage.setItem('batchconvert_folder', JSON.stringify({
                                lastSourceFolder: formResult.folder,
                                lastTargetFormat: formResult.format,
                                lastKeepOpen: formResult.keep_open,
                                lastCopyTexture: formResult.copy_texture
                            }));
                            Blockbench.showQuickMessage("batch_convert.processing");
                            // 递归遍历这个文件夹，找到名为resourcepacks这个文件夹
                            const files = await walkDir(formResult.folder);
                            for (let file of files) {
                                if (file.endsWith("resourcepack")) {
                                    // 遍历里面的文件夹，调用doConvert
                                    const resFiles = fs.readdirSync(file);
                                    for (let resFile of resFiles) {
                                        const fullResFile = file + separator + resFile;
                                        // 判断是否为文件夹
                                        if (fs.statSync(fullResFile).isDirectory()) {
                                            console.log(fullResFile);
                                            if (fullResFile.endsWith("_converted")) {
                                                continue;
                                            }
                                            // 调用doConvert
                                            await doConvert(fullResFile, formResult.format, undefined, formResult.keep_open, formResult.copy_texture);
                                        }
                                    }
                                }
                            }
                            // 递归遍历resourcepacks文件夹，找到所有的文件夹
                            /*await doConvert(formResult.folder, formResult.format, formResult.save_to, formResult.keep_open);
                            Blockbench.showMessageBox({
                                title: "batch_convert.success",
                                icon: "info",
                                message: "batch_convert.success",
                            });*/
                        } catch (e) {
                            console.error(e);
                            Blockbench.showMessageBox({
                                title: "batch_convert.error",
                                icon: "warning",
                                message: e.message,
                            });
                        }
                    }
                }).show();
            }
        });

        /**
         * 批量截图处理函数
         * @param folder {string} 模型所在文件夹
         * @param output {string} 截图输出文件夹
         * @param width {number} 截图宽度
         * @param height {number} 截图高度
         * @param keepOpen {boolean} 是否保持项目打开
         */
        async function doBatchScreenshot(folder, output, keepOpen) {
            const filePaths = await walk(folder); // 获取所有 .json/.bbmodel 文件
            // 逐个读取并截图
            let index = 0;
            for (const path of filePaths) {
                // 筛选出 .json/.bbmodel 文件
                if (!path.endsWith('.json') && !path.endsWith('.bbmodel')) {
                    continue;
                }
                // 读取文件内容
                let content = fs.readFileSync(path, 'utf-8');
                let name = path.split(separator).pop(); // 带扩展名的文件名
                let baseName = name.replace(/\.\w+$/, ''); // 去掉扩展名

                // 以 Blockbench 文件读取方式转换成 FileResult
                let fileResult = {
                    content: content,
                    name: name,
                    path: path
                };

                // 加载到 Blockbench 当前 Project
                loadModelFile(fileResult);

                // 在此可自定义相机位置/角度，如果有需要的话
                // 例如：Viewport.zoom = 1.0; Viewport.pitch = 45; Viewport.yaw = 45; ...

                // 需要等待自动加载贴图
                await new Promise(resolve => setTimeout(resolve, 100));

                // 执行截图
                await new Promise((resolve, reject) => {
                    Blockbench.Screencam.screenshotPreview(
                        Blockbench.Screencam.NoAAPreview,
                        { },
                        (data) => {
                            try {
                                // 确保输出文件夹存在
                                if (!fs.existsSync(output)) {
                                    fs.mkdirSync(output, { recursive: true });
                                }
                                // 文件名可根据需要定制
                                let screenshotName = baseName + '.png';
                                let savePath = output + separator + screenshotName;
                                // 去掉 data:image/png;base64, 前缀，只保留base64内容
                                const base64Data = data.replace(/^data:image\/png;base64,/, "");
                                fs.writeFileSync(savePath, base64Data, 'base64');
                                resolve();
                            } catch (err) {
                                reject(err);
                            }
                        }
                    );
                });

                // 截图完成后，是否关闭项目
                if (!keepOpen && Project) {
                    await Project.close(true);
                }
                index++;
                Blockbench.setProgress(Math.min(1, index / filePaths.length));
            }
            // 处理完成后进度条归零
            Blockbench.setProgress(-1);
        }

        const actionBatchScreenshot = new Action("batch-screenshot", {
            name: "batch_screenshot.title",
            description: "batch_screenshot.intro",
            icon: "icon-format_bedrock",
            condition: () => true,
            click: () => {
                // 读取缓存参数
                const localStorageConfig = JSON.parse(localStorage.getItem('batch_screenshot')) || {};
                new Dialog("batch-screenshot-dialog", {
                    title: "batch_screenshot.title",
                    id: "batch-screenshot-dialog",
                    form: {
                        text1: {
                            type: "info",
                            text: "batch_screenshot.intro"
                        },
                        folder: {
                            type: 'folder',
                            label: 'batch_screenshot.source_folder',
                            value: localStorageConfig['lastSourceFolder'] || ''
                        },
                        output: {
                            type: 'folder',
                            label: 'batch_screenshot.export_folder',
                            value: localStorageConfig['lastOutputFolder'] || ''
                        },
                        keep_open: {
                            type: 'checkbox',
                            label: 'batch_screenshot.keep_open',
                            value: localStorageConfig['lastKeepOpen'] || false
                        }
                    },
                    onConfirm: async (formResult) => {
                        // 校验参数
                        if (!formResult.folder || !formResult.output) {
                            Blockbench.showMessageBox({
                                title: "batch_screenshot.missing_args.title",
                                icon: "warning",
                                message: "batch_screenshot.missing_args.message"
                            });
                            return;
                        }
                        // 缓存配置
                        localStorage.setItem('batch_screenshot', JSON.stringify({
                            lastSourceFolder: formResult.folder,
                            lastOutputFolder: formResult.output,
                            lastKeepOpen: formResult.keep_open
                        }));

                        // 执行截图
                        try {
                            Blockbench.showQuickMessage("batch_screenshot.processing");
                            await doBatchScreenshot(
                                formResult.folder,
                                formResult.output,
                                formResult.keep_open
                            );
                            Blockbench.showMessageBox({
                                title: "batch_screenshot.success",
                                icon: "info",
                                message: "batch_screenshot.success"
                            });
                        } catch (err) {
                            console.error(err);
                            Blockbench.showMessageBox({
                                title: "batch_screenshot.error",
                                icon: "warning",
                                message: err.message,
                            });
                        }
                    }
                }).show();
            }
        });

        MenuBar.menus.tools.addAction(action);
        MenuBar.menus.tools.addAction(actionFolder);
        MenuBar.menus.tools.addAction(actionBatchScreenshot);
    }
});