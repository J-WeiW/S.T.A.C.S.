document.addEventListener('DOMContentLoaded', () => {
    let phase = 'stealth'; 
    let power = 100.0, heat = 15.0, playerHP = 100, enemyHP = 100;
    let velocity = 0, distance = 15000, weaponCurrentCharge = 0;
    const weaponRange = 8000; 
    let isBraking = false, isParrying = false;
    let evasionRate = 0, accuracyRate = 100;
    let enemyAttackTimer = 0, isIncomingAttack = false;
    let ewarScore = 0, enemyStunnedTimer = 0;

    const ui = {
        capFill: document.getElementById('cap-bar-fill'), capNet: document.getElementById('cap-net'),
        heatFill: document.getElementById('heat-bar-fill'), heatWarn: document.getElementById('heat-warning'),
        hpFill: document.getElementById('player-hp-fill'), hpText: document.getElementById('player-hp-text'),
        enemyHpFill: document.getElementById('enemy-hp-fill'), enemyHpText: document.getElementById('enemy-hp-text'),
        evasionText: document.getElementById('player-evasion'), accuracyText: document.getElementById('player-accuracy'),
        velocityVal: document.getElementById('velocity-val'), 
        distanceVal: document.getElementById('distance-val'), distanceContainer: document.getElementById('distance-container'),
        weaponFill: document.getElementById('weapon-charge-fill'), phaseText: document.getElementById('game-phase-text'),
        warnBox: document.getElementById('warning-box'), warnTitle: document.getElementById('warning-title'), warnDesc: document.getElementById('warning-desc'),
        overlay: document.getElementById('fx-overlay'), gameOverText: document.getElementById('game-over-text'),
        enemyBlock: document.getElementById('enemy-status'), enemyBlip: document.getElementById('enemy-blip'),
        ewarMarker: document.getElementById('ewar-marker'),
        logsNarrative: document.getElementById('narrative-logs'), logsTerminal: document.getElementById('terminal-logs')
    };

    const sliders = { engine: document.getElementById('engine-slider'), weapon: document.getElementById('weapon-slider') };
    const btns = { radar: document.getElementById('btn-radar'), shield: document.getElementById('btn-shield'), fire: document.getElementById('btn-fire'), brake: document.getElementById('btn-brake') };

    function logMsg(target, text, className) {
        const p = document.createElement('p'); p.className = className; p.textContent = text;
        target.appendChild(p); target.scrollTop = target.scrollHeight;
    }

    const configPanel = document.getElementById('api-config-panel');
    const btnToggleConfig = document.getElementById('btn-config-toggle');
    const inputUrl = document.getElementById('api-url');
    const inputModel = document.getElementById('api-model');
    const inputKey = document.getElementById('api-key');
    const inputOllama = document.getElementById('ollama-model');
    const btnSaveConfig = document.getElementById('btn-save-config');

    if (localStorage.getItem('aegis_api_url')) inputUrl.value = localStorage.getItem('aegis_api_url');
    if (localStorage.getItem('aegis_api_model')) inputModel.value = localStorage.getItem('aegis_api_model');
    if (localStorage.getItem('aegis_api_key')) inputKey.value = localStorage.getItem('aegis_api_key');
    if (localStorage.getItem('aegis_ollama_model')) inputOllama.value = localStorage.getItem('aegis_ollama_model');

    btnToggleConfig.addEventListener('click', () => { configPanel.style.display = configPanel.style.display === 'none' ? 'flex' : 'none'; });
    btnSaveConfig.addEventListener('click', () => {
        localStorage.setItem('aegis_api_url', inputUrl.value.trim());
        localStorage.setItem('aegis_api_model', inputModel.value.trim());
        localStorage.setItem('aegis_api_key', inputKey.value.trim());
        localStorage.setItem('aegis_ollama_model', inputOllama.value.trim());
        configPanel.style.display = 'none';
        logMsg(ui.logsTerminal, "[系统]: 核心配置文件已写入终端寄存器。", "system-msg");
    });

    const btnMic = document.getElementById('btn-mic');
    const inputCmd = document.getElementById('ai-command-input');
    let isRecording = false;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.lang = 'zh-CN'; recognition.continuous = false; recognition.interimResults = false;
        recognition.onstart = function() { isRecording = true; btnMic.classList.add('mic-active'); inputCmd.placeholder = "正在聆听中..."; };
        recognition.onresult = function(event) { inputCmd.value = event.results[0][0].transcript; document.getElementById('btn-ai-send').click(); };
        recognition.onerror = function(event) { logMsg(ui.logsTerminal, `[语音拦截]: ${event.error}`, "warn-msg"); };
        recognition.onend = function() { isRecording = false; btnMic.classList.remove('mic-active'); inputCmd.placeholder = "请说话，或输入指令..."; };
        btnMic.addEventListener('click', () => { if (isRecording) { recognition.stop(); } else { recognition.start(); } });
    } else {
        btnMic.style.display = 'none'; logMsg(ui.logsTerminal, "当前终端不支持音频接收协议，请手动输入。", "warn-msg");
    }

    const startBrake = () => { isBraking = true; btns.brake.classList.add('active-brake'); };
    const stopBrake = () => { isBraking = false; btns.brake.classList.remove('active-brake'); };
    btns.brake.addEventListener('mousedown', startBrake); btns.brake.addEventListener('mouseup', stopBrake); btns.brake.addEventListener('mouseleave', stopBrake);

    // --- 核心战局控制能力 ---
    function discoverEnemy() {
        if(phase === 'combat' || phase === 'gameover') return;
        phase = 'combat';
        ui.phaseText.textContent = "接敌交战 (COMBAT)"; ui.phaseText.className = "phase-combat";
        ui.enemyBlock.style.opacity = "1"; ui.enemyBlip.style.display = "block";
        ui.enemyHpText.textContent = `${Math.ceil(enemyHP)} / 100`;
        ui.distanceContainer.style.opacity = "1";
        logMsg(ui.logsNarrative, "雷达捕获敌对热源，进入交战协议。", "story-msg");
        logMsg(ui.logsTerminal, "【红盾协议开启】检测到敌对力量，允许火力交战。", "danger-msg");
        ui.warnBox.className = "warning-box"; ui.warnTitle.textContent = "交战中"; ui.warnDesc.textContent = "请监控火控射程。";
    }

    // AI 生成敌人的神明模式
    function forceSpawnEnemy() {
        if(phase === 'combat') {
            logMsg(ui.logsTerminal, "Aegis: 舰长，我们目前已经在交战中了，请专注当前目标。", "ai-msg");
            return;
        }
        enemyHP = 100;
        distance = 18000; // 刷在较远的地方
        ewarScore = 0;
        enemyStunnedTimer = 0;
        logMsg(ui.logsTerminal, "Aegis: 遵命。正在雷达网中注入全真敌对模拟信号/召唤敌舰...", "ai-msg");
        discoverEnemy();
    }

    // AI 强制隐身脱战的神明模式
    function forceStealth() {
        phase = 'stealth';
        ui.phaseText.textContent = "隐蔽巡航模式 (STEALTH)"; ui.phaseText.className = "phase-stealth";
        ui.enemyBlock.style.opacity = "0.2"; ui.enemyBlip.style.display = "none";
        ui.distanceContainer.style.opacity = "0";
        isIncomingAttack = false;
        heat = Math.min(heat, 40); // 强行降温避免秒被发现
        logMsg(ui.logsTerminal, "Aegis: 已执行紧急光学与热源静默，强行脱离接触。", "ai-msg");
        logMsg(ui.logsNarrative, "舰体表面装甲发生光学偏折，巨大的战舰如幽灵般消失在星海中。", "story-msg");
        ui.warnBox.className = "warning-box"; ui.warnTitle.textContent = "深空静默"; ui.warnDesc.textContent = "我们现在是安全的。";
    }

    function loseTarget() {
        if(phase !== 'combat') return;
        phase = 'jammed';
        ui.phaseText.textContent = "信号丢失 (JAMMED)"; ui.phaseText.className = "phase-jammed";
        ui.enemyBlock.style.opacity = "0.2"; ui.enemyBlip.style.display = "none";
        isIncomingAttack = false; btns.fire.disabled = true; btns.fire.classList.remove('ready');
        ui.distanceContainer.style.opacity = "0.3"; ui.distanceVal.textContent = "ERR"; ui.distanceVal.className = "warning-text";
        ui.warnBox.className = "warning-box alert"; ui.warnTitle.textContent = "传感器死机"; ui.warnDesc.textContent = "必须重新发送脉冲！";
        logMsg(ui.logsTerminal, "【致盲】火控锁定丢失！", "warn-msg");
    }

    function takeDamage(amount) {
        playerHP = Math.max(0, playerHP - amount);
        ui.hpFill.style.width = `${playerHP}%`; ui.hpText.textContent = `${Math.ceil(playerHP)} / 100`;
        ui.overlay.className = "fx-overlay damage";
        setTimeout(() => { if(phase !== 'gameover') ui.overlay.className = "fx-overlay"; }, 300);
        if(playerHP <= 0) {
            phase = 'gameover'; ui.overlay.className = "fx-overlay destroyed"; ui.gameOverText.style.display = "block";
            logMsg(ui.logsNarrative, "外壳彻底破裂，全舰覆没...", "story-msg");
        }
    }

    // 主系统循环
    setInterval(() => {
        if(phase === 'gameover') return;
        let enginePower = parseInt(sliders.engine.value);
        let weaponDrain = parseInt(sliders.weapon.value);
        document.getElementById('engine-power-val').textContent = `${enginePower}%`;
        document.getElementById('weapon-val').textContent = `${weaponDrain}%`;

        if(isBraking) { velocity = Math.max(0, velocity - 40); heat += 1.5; } 
        else { let tv = enginePower * 10; velocity += (velocity < tv) ? 5 : (velocity > tv ? -1 : 0); }
        
        if(phase === 'combat' || phase === 'jammed') {
            distance = Math.max(2000, distance - (velocity / 10) + 20); 
            let blipDist = Math.min(80, (distance / 15000) * 80);
            ui.enemyBlip.style.top = `${80 - blipDist}px`; 
        }

        ui.velocityVal.textContent = Math.floor(velocity);
        if (phase === 'combat') {
            ui.distanceVal.textContent = Math.floor(distance);
            ui.distanceVal.className = (distance <= weaponRange) ? "cyan-text" : "orange-text";
        } else if (phase === 'stealth') { ui.distanceVal.textContent = "---"; ui.distanceVal.className = ""; }

        evasionRate = (velocity / 1000) * 50; accuracyRate = 100 - (velocity / 1000) * 50; 
        ui.evasionText.textContent = `闪避: ${Math.floor(evasionRate)}%`; ui.accuracyText.textContent = `命中: ${Math.floor(accuracyRate)}%`;

        let netPower = 3.0 - (enginePower / 100) * 4.0 - (weaponDrain / 100) * 5.0;
        let netHeat = -2.0 + (enginePower / 100) * 3.0 + (weaponDrain / 100) * 3.0;
        power = Math.min(100, Math.max(0, power + netPower / 10));
        heat = Math.min(100, Math.max(0, heat + netHeat / 10));

        if(power <= 0) { sliders.engine.value = 0; sliders.weapon.value = 0; }
        if(heat >= 100) { ui.overlay.classList.add('overheat'); takeDamage(0.5); } else ui.overlay.classList.remove('overheat');
        
        // 只有不处于无敌时间才会被热量暴露
        if(phase === 'stealth' && heat >= 65) discoverEnemy();

        if(weaponDrain > 0 && power > 0) {
            weaponCurrentCharge = Math.min(100, weaponCurrentCharge + (weaponDrain / 100) * 2.0);
            ui.weaponFill.style.width = `${weaponCurrentCharge}%`;
        }
        
        if(weaponCurrentCharge >= 100 && phase === 'combat' && distance <= weaponRange) {
            btns.fire.disabled = false; btns.fire.classList.add('ready');
        } else {
            btns.fire.disabled = true; btns.fire.classList.remove('ready');
        }

        ui.capFill.style.width = `${power}%`; ui.heatFill.style.width = `${heat}%`;
        ui.capNet.textContent = `${netPower >= 0 ? '+' : ''}${netPower.toFixed(1)}/s`;
        ui.capNet.style.color = netPower >= 0 ? "var(--green)" : "var(--red)";

        if(phase === 'combat' || phase === 'jammed') {
            if(enemyStunnedTimer > 0) {
                enemyStunnedTimer -= 0.1; ui.ewarMarker.style.left = "100%";
            } else {
                ewarScore -= 0.3; 
                if(ewarScore <= -100) { ewarScore = 0; loseTarget(); }
                ui.ewarMarker.style.left = `${50 + (ewarScore / 2)}%`;
            }
        }

        if((phase === 'combat' || phase === 'jammed') && enemyStunnedTimer <= 0) {
            if(!isIncomingAttack && Math.random() < 0.015) { 
                isIncomingAttack = true; enemyAttackTimer = Math.max(2.0, 4.0 - (10000 - distance)/5000); 
                ui.warnBox.className = "warning-box alert"; ui.warnTitle.textContent = "高能预警";
            }
            if(isIncomingAttack) {
                enemyAttackTimer -= 0.1; ui.warnDesc.textContent = `冲击倒计时: ${enemyAttackTimer.toFixed(1)}s`;
                if(enemyAttackTimer <= 0) {
                    isIncomingAttack = false;
                    ui.warnBox.className = "warning-box"; ui.warnTitle.textContent = (phase === 'combat') ? "交战中" : "传感器死机";
                    if(isParrying) {
                        logMsg(ui.logsTerminal, "【完美弹反】等离子力场折射光束！", "ai-msg");
                        ui.overlay.className = "fx-overlay parry"; setTimeout(() => { if(phase !== 'gameover') ui.overlay.className = "fx-overlay"; }, 500);
                        heat = Math.max(0, heat - 20); 
                    } else if (Math.random() * 100 < evasionRate) {
                        logMsg(ui.logsTerminal, "侧滑闪避成功！", "ai-msg");
                    } else {
                        logMsg(ui.logsTerminal, "遭到打击！", "danger-msg"); takeDamage(25);
                    }
                }
            }
        }
    }, 100);

    btns.radar.addEventListener('click', () => {
        if(power < 10) return; power -= 10; heat += 25;
        logMsg(ui.logsTerminal, "大功率宽幅微波发射...", "system-msg");
        if(phase === 'stealth' || phase === 'jammed') { setTimeout(() => { if(phase === 'jammed') ewarScore = 0; discoverEnemy(); }, 800); }
    });
    btns.shield.addEventListener('click', () => {
        if(power < 15 || isParrying) return; power -= 15; isParrying = true;
        btns.shield.classList.add('active'); btns.shield.textContent = "力场偏转中...";
        setTimeout(() => { isParrying = false; btns.shield.classList.remove('active'); btns.shield.textContent = "偏导力场展开 (1秒弹反)"; }, 1000); 
    });
    btns.fire.addEventListener('click', () => {
        if(weaponCurrentCharge < 100 || phase !== 'combat' || distance > weaponRange) return;
        heat += 30; weaponCurrentCharge = 0; sliders.weapon.value = 0; ui.weaponFill.style.width = "0%"; btns.fire.disabled = true; btns.fire.classList.remove('ready');
        if(Math.random() * 100 < accuracyRate) {
            logMsg(ui.logsTerminal, "确认命中！", "ai-msg"); enemyHP -= 45;
            if(enemyHP <= 0) {
                enemyHP = 0; phase = 'gameover'; logMsg(ui.logsNarrative, "敌舰解体，空域安全。", "story-msg");
                ui.warnBox.className = "warning-box"; ui.warnTitle.textContent = "胜利"; ui.warnDesc.textContent = "威胁归零。";
                ui.phaseText.textContent = "星区安全 (CLEARED)"; ui.phaseText.style.color = "var(--green)";
            }
            ui.enemyHpFill.style.width = `${enemyHP}%`; ui.enemyHpText.textContent = `${Math.ceil(enemyHP)} / 100`;
        } else { logMsg(ui.logsTerminal, "射击落空！请减速！", "warn-msg"); }
    });

    const nodes = document.querySelectorAll('.ewar-node');
    setInterval(() => {
        if (phase !== 'combat' || enemyStunnedTimer > 0) return;
        const n = nodes[Math.floor(Math.random() * nodes.length)];
        if (n.classList.contains('alert')) return;
        n.classList.add('alert');
        n.hackTimer = setTimeout(() => { if(n.classList.contains('alert')) { n.classList.remove('alert'); ewarScore -= 30; heat += 10; } }, 1200); 
    }, 2200);
    nodes.forEach(node => {
        node.addEventListener('click', function() {
            if(this.classList.contains('alert')) {
                clearTimeout(this.hackTimer); this.classList.remove('alert'); this.classList.add('safe');
                ewarScore += 20; 
                if(ewarScore >= 100) { ewarScore = 0; enemyStunnedTimer = 6.0; logMsg(ui.logsTerminal, "[网络反制] 敌机火控熔断！", "ai-msg"); }
                setTimeout(() => this.classList.remove('safe'), 200);
            }
        });
    });

    // --- 极度聪明的神明模式 AI 调度系统 ---
    
    // 全新架构的 System Prompt：告诉 AI 它不仅是一个程序，还是一个能掌控战局的 GM
    const SYSTEM_PROMPT = `你是星舰战术AI Aegis。性格冷酷、绝对理性。你不仅是舰长的副官，还能通过系统权限掌控战局。
回复必须简短（30字内）。你必须在回复末尾附带以下控制标签之一（且只能带一个）：
- 若舰长和你日常闲聊、询问局势、打招呼：附带 [CHAT]
- 若舰长要求减速、停车、刹车：附带 [BRAKE]
- 若舰长要求逃跑、规避、全速前进：附带 [EVADE]
- 若舰长要求攻击、开火、武器充能：附带 [ATTACK]
- 若舰长要求扫描、开雷达：附带 [RADAR]
- 若舰长要求【寻找刺激、战斗演习、制造敌人、太无聊了】：附带 [SPAWN_ENEMY]
- 若舰长要求【强行脱战、隐形、消除敌人】：附带 [FORCE_STEALTH]
严禁使用 Markdown 代码块，必须直接说话并加上标签！`;

    document.getElementById('btn-ai-send').addEventListener('click', async () => {
        const cmd = inputCmd.value.trim();
        if(!cmd) return;
        logMsg(ui.logsTerminal, `舰长: ${cmd}`, 'system-msg');
        inputCmd.value = '';

        const apiKey = inputKey.value.trim();
        const pElement = document.createElement('p');
        pElement.className = "ai-msg";
        ui.logsTerminal.appendChild(pElement);
        ui.logsTerminal.scrollTop = ui.logsTerminal.scrollHeight;

        let intentResult = "";

        // API 调用流
        if (apiKey) {
            try {
                pElement.textContent = "Aegis: [连线云端节点...]";
                intentResult = await fetchCloudAPI(cmd, pElement);
            } catch (e) {
                try {
                    pElement.textContent = "Aegis: [载入本地矩阵...]";
                    intentResult = await fetchOllamaAPI(cmd, pElement);
                } catch (e2) {
                    intentResult = await runSimulator(cmd, pElement);
                }
            }
        } else {
            try {
                pElement.textContent = "Aegis: [载入本地矩阵...]";
                intentResult = await fetchOllamaAPI(cmd, pElement);
            } catch (e) {
                intentResult = await runSimulator(cmd, pElement);
            }
        }

        // 统一分发动图
        triggerGameActions(intentResult);
    });

    async function fetchCloudAPI(cmd, pElement) {
        const url = inputUrl.value.trim();
        const model = inputModel.value.trim();
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${inputKey.value.trim()}` },
            body: JSON.stringify({ model: model, stream: true, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: cmd }]})
        });
        if (!response.ok) throw new Error("Cloud Error");
        return await readStreamAndType(response, pElement);
    }

    async function fetchOllamaAPI(cmd, pElement) {
        const ollamaModel = inputOllama.value.trim();
        const response = await fetch('http://localhost:11434/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: ollamaModel, stream: true, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: cmd }]})
        });
        if (!response.ok) throw new Error("Ollama Error");
        return await readStreamAndType(response, pElement);
    }

    // 抽取的公共流解析工具，它会把带标签的话实时显示在界面上，并把真实结果返回给后台
    async function readStreamAndType(response, pElement) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullText = "", buffer = "";
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); 
            
            for (let line of lines) {
                line = line.trim();
                if (!line || line === 'data: [DONE]') continue;
                if (line.startsWith('data: ')) { // OpenAI Format
                    try {
                        const jsonData = JSON.parse(line.substring(6));
                        if (jsonData.choices[0].delta.content) {
                            fullText += jsonData.choices[0].delta.content;
                            // 过滤所有新老标签，让玩家看不到大模型的脑后指令
                            pElement.textContent = "Aegis: " + fullText.replace(/\[(BRAKE|EVADE|ATTACK|RADAR|CHAT|SPAWN_ENEMY|FORCE_STEALTH)\]/gi, "");
                            ui.logsTerminal.scrollTop = ui.logsTerminal.scrollHeight;
                        }
                    } catch (e) {}
                } else { // Ollama Format
                    try {
                        const json = JSON.parse(line);
                        if (json.message && json.message.content) {
                            fullText += json.message.content;
                            pElement.textContent = "Aegis: " + fullText.replace(/\[(BRAKE|EVADE|ATTACK|RADAR|CHAT|SPAWN_ENEMY|FORCE_STEALTH)\]/gi, "");
                            ui.logsTerminal.scrollTop = ui.logsTerminal.scrollHeight;
                        }
                    } catch (e) {}
                }
            }
        }
        return fullText.toUpperCase();
    }

    // 更新后的本地断网模拟器，加入了闲聊和刷怪降级
    async function runSimulator(cmd, pElement) {
        return new Promise(resolve => {
            let intent = "[CHAT]";
            let reply = "你好，舰长。由于通信模组故障，我目前只能进行有限的本地解析。";
            
            if (cmd.includes('刹车') || cmd.includes('停')) { intent = "[BRAKE]"; reply = "强制降速程序已启动。"; }
            else if (cmd.includes('跑') || cmd.includes('规避')) { intent = "[EVADE]"; reply = "最高航速协议已解锁，规避中。"; }
            else if (cmd.includes('开火') || cmd.includes('打')) { intent = "[ATTACK]"; reply = "主炮供能接管。"; }
            else if (cmd.includes('雷达') || cmd.includes('扫')) { intent = "[RADAR]"; reply = "强制开启电磁脉冲。"; }
            else if (cmd.includes('敌人') || cmd.includes('无聊') || cmd.includes('模拟')) { intent = "[SPAWN_ENEMY]"; reply = "如您所愿，已为您生成战术目标。"; }
            else if (cmd.includes('脱战') || cmd.includes('隐形')) { intent = "[FORCE_STEALTH]"; reply = "紧急脱离接触，进入静默模式。"; }

            let i = 0; pElement.textContent = "Aegis: ";
            const timer = setInterval(() => {
                pElement.textContent += reply.charAt(i++);
                ui.logsTerminal.scrollTop = ui.logsTerminal.scrollHeight;
                if(i >= reply.length) { clearInterval(timer); resolve(intent); }
            }, 30);
        });
    }

    // 终极动作分发中心
    function triggerGameActions(text) {
        if (text.includes("[CHAT]")) {
            // 什么都不做，大模型已经跟舰长聊完天了
            return; 
        }
        else if(text.includes("[BRAKE]")) { startBrake(); setTimeout(stopBrake, 2500); } 
        else if (text.includes("[EVADE]")) { sliders.engine.value = 100; sliders.weapon.value = 0; } 
        else if (text.includes("[ATTACK]")) { sliders.engine.value = 0; sliders.weapon.value = 100; }
        else if (text.includes("[RADAR]")) { btns.radar.click(); }
        else if (text.includes("[SPAWN_ENEMY]")) { forceSpawnEnemy(); }
        else if (text.includes("[FORCE_STEALTH]")) { forceStealth(); }
    }
});