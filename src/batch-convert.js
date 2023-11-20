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
            "batch_convert.intro": "Select a folder and you can easily batch convert all the models in the folder.",
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
        });
        Language.addTranslations("zh", {
            "batch_convert.title": "批量转换",
            "batch_convert.intro": "选择一个文件夹，方便地批量转换文件夹中的所有模型，并保留原来的目录结构。",
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
        });
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
                        file = dir + '/' + file; // 使用字符串拼接代替 path.resolve
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
                                }
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
        const processFiles = async (folder, fileResults, formatType, saveTo, keepOpen) => {
            console.log("processFiles", fileResults, formatType, saveTo);
            let index = 0;
            for (let file of fileResults) {
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

                if (!keepOpen && Project) {
                    await Project.close(true);
                }
                index++;
                Blockbench.setProgress(Math.min(1, index / fileResults.length));
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
        const doConvert = async (folder, format, saveTo, keepOpen) => {
            console.log("doConvert", folder, format, saveTo);
            // 遍历folder，获得里面的所有的json文件的绝对路径
            const files = await walk(folder);
            Blockbench.read(files, {
                readtype: 'text',
                errorbox: true
            }, (results) => {
                if (!saveTo) {
                    // 设置为folder的父目录
                    saveTo = folder.split('/').slice(0, -1).join('/');
                }
                // 判断save_to是否为空
                if (!fs.existsSync(saveTo)) {
                    fs.mkdirSync(saveTo, {recursive: true});
                }
                if (fs.readdirSync(saveTo).length > 0) {
                    // 先在save_to目录创建一个与folder文件夹带后缀的新文件夹
                    saveTo = saveTo + '/' + folder.split('/').pop() + '_converted';
                    fs.mkdirSync(saveTo, {recursive: true});
                }
                processFiles(folder, results, format, saveTo, keepOpen)
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
                            await doConvert(formResult.folder, formResult.format, formResult.save_to, formResult.keep_open);
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
        MenuBar.menus.tools.addAction(action)
    }
});