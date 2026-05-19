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
        velocityVal: document.getElementById('velocity-val'), distanceVal: document.getElementById('distance-val'), distanceContainer: document.getElementById('distance-container'),
        weaponFill: document.getElementById('weapon-charge-fill'), phaseText: document.getElementById('game-phase-text'),
        attackAlert: document.getElementById('attack-alert'), attackCountdown: document.getElementById('attack-countdown'),
        overlay: document.getElementById('fx-overlay'), gameOverText: document.getElementById('game-over-text'),
        enemyBlock: document.getElementById('enemy-status'), enemyBlip: document.getElementById('enemy-blip'),
        ewarMarker: document.getElementById('ewar-marker'),
        logsNarrative: document.getElementById('narrative-logs'), logsTerminal: document.getElementById('terminal-logs'),
        cockpitGrid: document.getElementById('cockpit-grid') // 获取主界面容器用于触发震动
    };

    const sliders = { engine: document.getElementById('engine-slider'), weapon: document.getElementById('weapon-slider'), repair: document.getElementById('repair-slider') };
    const btns = { radar: document.getElementById('btn-radar'), shield: document.getElementById('btn-shield'), fire: document.getElementById('btn-fire'), brake: document.getElementById('btn-brake') };

    function logMsg(target, text, className) {
        const p = document.createElement('p'); p.className = className; p.textContent = text;
        target.appendChild(p); target.scrollTop = target.scrollHeight;
    }

    const configPanel = document.getElementById('api-config-panel');
    const inputUrl = document.getElementById('api-url'), inputModel = document.getElementById('api-model'), inputKey = document.getElementById('api-key'), inputOllama = document.getElementById('ollama-model');
    
    if (localStorage.getItem('aegis_api_url')) inputUrl.value = localStorage.getItem('aegis_api_url');
    if (localStorage.getItem('aegis_api_model')) inputModel.value = localStorage.getItem('aegis_api_model');
    if (localStorage.getItem('aegis_api_key')) inputKey.value = localStorage.getItem('aegis_api_key');
    if (localStorage.getItem('aegis_ollama_model')) inputOllama.value = localStorage.getItem('aegis_ollama_model');

    document.getElementById('btn-config-toggle').addEventListener('click', () => { configPanel.style.display = configPanel.style.display === 'none' ? 'flex' : 'none'; });
    document.getElementById('btn-save-config').addEventListener('click', () => {
        localStorage.setItem('aegis_api_url', inputUrl.value.trim()); localStorage.setItem('aegis_api_model', inputModel.value.trim());
        localStorage.setItem('aegis_api_key', inputKey.value.trim()); localStorage.setItem('aegis_ollama_model', inputOllama.value.trim());
        configPanel.style.display = 'none'; logMsg(ui.logsTerminal, "[系统]: 核心配置已写入寄存器。", "system-msg");
    });

    const btnMic = document.getElementById('btn-mic'); const inputCmd = document.getElementById('ai-command-input');
    let isRecording = false; const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        let recognition = new SpeechRecognition(); recognition.lang = 'zh-CN'; recognition.continuous = false;
        recognition.onstart = function() { isRecording = true; btnMic.classList.add('mic-active'); inputCmd.placeholder = "正在聆听..."; };
        recognition.onresult = function(event) { inputCmd.value = event.results[0][0].transcript; document.getElementById('btn-ai-send').click(); };
        recognition.onend = function() { isRecording = false; btnMic.classList.remove('mic-active'); inputCmd.placeholder = "输入控制指令..."; };
        btnMic.addEventListener('click', () => { isRecording ? recognition.stop() : recognition.start(); });
    } else { btnMic.style.display = 'none'; }

    const startBrake = () => { isBraking = true; btns.brake.classList.add('active-brake'); };
    const stopBrake = () => { isBraking = false; btns.brake.classList.remove('active-brake'); };
    btns.brake.addEventListener('mousedown', startBrake); btns.brake.addEventListener('mouseup', stopBrake); btns.brake.addEventListener('mouseleave', stopBrake);

    function discoverEnemy() {
        if(phase === 'combat' || playerHP <= 0) return;
        phase = 'combat'; 
        ui.phaseText.textContent = "接敌交战 (COMBAT)"; ui.phaseText.className = "phase-combat";
        ui.enemyBlock.style.opacity = "1"; ui.enemyBlip.style.display = "block"; ui.distanceContainer.style.opacity = "1";
        ui.enemyHpFill.style.width = `${enemyHP}%`; ui.enemyHpText.textContent = `${Math.ceil(enemyHP)} / 100`;
        logMsg(ui.logsNarrative, "雷达捕获不明质量体高速接近，确认进入轨道武器交战距离。", "story-msg");
    }

    function loseTarget() {
        if(phase !== 'combat') return;
        phase = 'jammed'; ui.phaseText.textContent = "信号丢失 (JAMMED)"; ui.phaseText.className = "phase-jammed";
        ui.enemyBlock.style.opacity = "0.2"; ui.enemyBlip.style.display = "none"; isIncomingAttack = false; btns.fire.disabled = true; btns.fire.classList.remove('ready');
        ui.distanceContainer.style.opacity = "0.3"; ui.distanceVal.textContent = "ERR"; ui.attackAlert.style.display = "none"; 
        logMsg(ui.logsTerminal, "【致盲】火控雷达锁定丢失！", "warn-msg");
    }

    // --- 受到攻击时的重度动能震撼反馈 ---
    function takeDamage(amount) {
        playerHP = Math.max(0, playerHP - amount);
        ui.hpFill.style.width = `${playerHP}%`; ui.hpText.textContent = `${Math.ceil(playerHP)} / 100`;
        
        // 触发全屏变红 & 仪表盘剧烈晃动模糊
        ui.overlay.classList.add('damage'); 
        ui.cockpitGrid.classList.add('impact-fx');
        
        setTimeout(() => { 
            if(playerHP > 0) ui.overlay.classList.remove('damage'); 
            ui.cockpitGrid.classList.remove('impact-fx');
        }, 400);

        if(playerHP <= 0) { 
            phase = 'gameover'; ui.overlay.className = "fx-overlay destroyed"; ui.gameOverText.style.display = "block"; ui.enemyBlip.style.display = "none";
            ui.attackAlert.style.display = "none";
            logMsg(ui.logsNarrative, "穿甲弹贯穿反应堆，舰体在一片火海中彻底解体...", "story-msg"); 
        }
    }

    setInterval(() => {
        if(phase === 'gameover') return;
        
        let enginePower = parseInt(sliders.engine.value); 
        let weaponDrain = parseInt(sliders.weapon.value);
        let repairPower = parseInt(sliders.repair.value); 
        
        document.getElementById('engine-power-val').textContent = `${enginePower}%`; 
        document.getElementById('weapon-val').textContent = `${weaponDrain}%`;
        document.getElementById('repair-val').textContent = `${repairPower}%`;

        if(isBraking) { velocity = Math.max(0, velocity - 40); heat += 1.5; } 
        else { let tv = enginePower * 10; velocity += (velocity < tv) ? 5 : (velocity > tv ? -1 : 0); }
        
        if(phase === 'combat' || phase === 'jammed') {
            distance = Math.max(2000, distance - (velocity / 10) + 20); 
            let blipDist = Math.min(140, (distance / 15000) * 140); 
            ui.enemyBlip.style.top = `${140 - blipDist}px`; 
        }

        ui.velocityVal.textContent = Math.floor(velocity);
        if (phase === 'combat') { ui.distanceVal.textContent = Math.floor(distance); ui.distanceVal.className = (distance <= weaponRange) ? "cyan-text" : "orange-text"; } 
        else if (phase === 'stealth' || phase === 'cleared') { ui.distanceVal.textContent = "---"; ui.distanceVal.className = ""; }

        evasionRate = (velocity / 1000) * 50; accuracyRate = 100 - (velocity / 1000) * 50; 
        ui.evasionText.textContent = `闪避: ${Math.floor(evasionRate)}%`; ui.accuracyText.textContent = `命中: ${Math.floor(accuracyRate)}%`;

        let netPower = 3.0 - (enginePower / 100) * 4.0 - (weaponDrain / 100) * 5.0 - (repairPower / 100) * 6.0;
        let netHeat = -2.0 + (enginePower / 100) * 3.0 + (weaponDrain / 100) * 3.0 + (repairPower / 100) * 4.0;
        
        power = Math.min(100, Math.max(0, power + netPower / 10)); 
        heat = Math.min(100, Math.max(0, heat + netHeat / 10));

        if(power <= 0) { sliders.engine.value = 0; sliders.weapon.value = 0; sliders.repair.value = 0;}
        
        if(heat >= 100) { ui.overlay.classList.add('overheat'); takeDamage(0.5); } else ui.overlay.classList.remove('overheat');
        if((phase === 'stealth' || phase === 'cleared') && heat >= 65) {
            if(phase === 'cleared') { distance = 15000; enemyHP = 100; logMsg(ui.logsTerminal, "高热暴露行踪，敌方新编队正在逼近！", "warn-msg"); }
            discoverEnemy();
        }

        if(weaponDrain > 0 && power > 0) { weaponCurrentCharge = Math.min(100, weaponCurrentCharge + (weaponDrain / 100) * 2.0); ui.weaponFill.style.width = `${weaponCurrentCharge}%`; }
        if(weaponCurrentCharge >= 100 && phase === 'combat' && distance <= weaponRange) { btns.fire.disabled = false; btns.fire.classList.add('ready'); } else { btns.fire.disabled = true; btns.fire.classList.remove('ready'); }

        if(repairPower > 0 && power > 0 && playerHP < 100) {
            playerHP = Math.min(100, playerHP + (repairPower / 100) * 0.5);
            ui.hpFill.style.width = `${playerHP}%`; ui.hpText.textContent = `${Math.ceil(playerHP)} / 100`;
        }

        ui.capFill.style.width = `${power}%`; ui.heatFill.style.width = `${heat}%`;
        ui.capNet.textContent = `${netPower >= 0 ? '+' : ''}${netPower.toFixed(1)}/s`; ui.capNet.style.color = netPower >= 0 ? "var(--green)" : "var(--red)";

        if(phase === 'combat' || phase === 'jammed') {
            if(enemyStunnedTimer > 0) { enemyStunnedTimer -= 0.1; ui.ewarMarker.style.left = "100%"; } 
            else { ewarScore -= 0.3; if(ewarScore <= -100) { ewarScore = 0; loseTarget(); } ui.ewarMarker.style.left = `${50 + (ewarScore / 2)}%`; }
        }

        // 敌方轨道炮开火判定
        if((phase === 'combat' || phase === 'jammed') && enemyStunnedTimer <= 0) {
            if(!isIncomingAttack && distance <= weaponRange && Math.random() < 0.015) { 
                isIncomingAttack = true; enemyAttackTimer = Math.max(2.0, 4.0 - (weaponRange - distance)/4000); 
                ui.attackAlert.style.display = "block"; 
                logMsg(ui.logsTerminal, "检测到强磁激增！敌方质量加速器已开火！", "danger-msg");
            }
            if(isIncomingAttack) {
                enemyAttackTimer -= 0.1; 
                ui.attackCountdown.textContent = Math.max(0, enemyAttackTimer).toFixed(1); 
                if(enemyAttackTimer <= 0) {
                    isIncomingAttack = false; ui.attackAlert.style.display = "none"; 
                    if(isParrying) { 
                        logMsg(ui.logsTerminal, "【完美防御】高强度力场成功弹开了钨钢穿甲弹！", "ai-msg"); 
                        ui.overlay.className = "fx-overlay parry"; setTimeout(() => { if(playerHP > 0) ui.overlay.className = "fx-overlay"; }, 500); heat = Math.max(0, heat - 20); 
                    } 
                    else if (Math.random() * 100 < evasionRate) { 
                        logMsg(ui.logsTerminal, "极速闪避！重型弹丸擦过舰体边缘！", "ai-msg"); 
                    } 
                    else { 
                        logMsg(ui.logsTerminal, "被敌方动能弹体直接命中！", "danger-msg"); 
                        takeDamage(25); 
                    }
                }
            }
        }
    }, 100);

    btns.radar.addEventListener('click', () => {
        if(power < 10 || playerHP <= 0) return; power -= 10; heat += 25; 
        logMsg(ui.logsTerminal, "释放大功率微波搜寻物理目标...", "system-msg");
        let previousPhase = phase;
        if(phase === 'stealth' || phase === 'jammed' || phase === 'cleared') { 
            setTimeout(() => { 
                if(previousPhase === 'jammed') { logMsg(ui.logsTerminal, "火控信道重置完毕，重新锁定敌方质量体！", "ai-msg"); ewarScore = 0; }
                if(previousPhase === 'cleared') { distance = 15000; enemyHP = 100; logMsg(ui.logsTerminal, "探测到新的敌方轨道舰队信号！", "warn-msg"); }
                discoverEnemy(); 
            }, 800); 
        }
    });

    btns.shield.addEventListener('click', () => {
        if(power < 15 || isParrying) return; power -= 15; isParrying = true;
        btns.shield.classList.add('active'); btns.shield.textContent = "高维偏导场激增中..."; setTimeout(() => { isParrying = false; btns.shield.classList.remove('active'); btns.shield.textContent = "偏导力场展开 (SHIELD)"; }, 1000); 
    });

    // --- 主炮开火：增加后坐力与屏幕黄白闪光 ---
    btns.fire.addEventListener('click', () => {
        if(weaponCurrentCharge < 100 || phase !== 'combat' || distance > weaponRange) return;
        
        // 资源重置
        heat += 30; weaponCurrentCharge = 0; sliders.weapon.value = 0; ui.weaponFill.style.width = "0%"; btns.fire.disabled = true; btns.fire.classList.remove('ready');
        
        // 触发极度爽快的轨道炮发射后坐力 VFX！
        ui.overlay.classList.add('firing');
        ui.cockpitGrid.classList.add('recoil-fx');
        setTimeout(() => {
            ui.overlay.classList.remove('firing');
            ui.cockpitGrid.classList.remove('recoil-fx');
        }, 250);

        if(Math.random() * 100 < accuracyRate) {
            logMsg(ui.logsNarrative, "电磁轨道炮轰鸣，重型质量弹丸以第一宇宙速度击穿敌舰装甲！", "story-msg");
            logMsg(ui.logsTerminal, "确认贯穿敌方核心结构！", "ai-msg"); 
            enemyHP -= 25; 
            if(enemyHP <= 0) { 
                enemyHP = 0; phase = 'cleared'; ui.enemyBlip.style.display = "none";
                isIncomingAttack = false; ui.attackAlert.style.display = "none";
                logMsg(ui.logsNarrative, "敌舰弹药库被诱爆，剧烈的物理殉爆照亮了这片深空。", "story-msg"); 
                ui.phaseText.textContent = "星区安全 (CLEARED)"; ui.phaseText.style.color = "var(--green)"; ui.distanceContainer.style.opacity = "0.3"; ui.distanceVal.textContent = "---";
            }
            ui.enemyHpFill.style.width = `${enemyHP}%`; ui.enemyHpText.textContent = `${Math.ceil(enemyHP)} / 100`;
        } else { 
            logMsg(ui.logsNarrative, "剧烈的电磁后坐力导致弹道偏离，实心弹丸飞向了宇宙深处。", "story-msg");
            logMsg(ui.logsTerminal, "射击落空！未能命中敌方物理模型！", "warn-msg"); 
        }
    });

    const nodes = document.querySelectorAll('.ewar-node');
    setInterval(() => {
        if (phase !== 'combat' || enemyStunnedTimer > 0) return;
        const n = nodes[Math.floor(Math.random() * nodes.length)];
        if (n.classList.contains('alert')) return; n.classList.add('alert');
        n.hackTimer = setTimeout(() => { if(n.classList.contains('alert')) { n.classList.remove('alert'); ewarScore -= 30; heat += 10; } }, 1200); 
    }, 2200);
    nodes.forEach(node => {
        node.addEventListener('click', function() {
            if(this.classList.contains('alert')) {
                clearTimeout(this.hackTimer); this.classList.remove('alert'); this.classList.add('safe'); ewarScore += 20; 
                if(ewarScore >= 100) { ewarScore = 0; enemyStunnedTimer = 6.0; logMsg(ui.logsTerminal, "木马注入成功！敌方火控服务器短路！", "ai-msg"); }
                setTimeout(() => this.classList.remove('safe'), 200);
            }
        });
    });

    // =========================================================================
    // --- 动态全知上下文系统 (替换为了动能武器语境) ---
    // =========================================================================
    function getDynamicSystemPrompt() {
        let stateDesc = "";
        if (phase === 'stealth') stateDesc = "隐蔽巡航，无敌对目标。";
        else if (phase === 'jammed') stateDesc = "致盲状态，失去轨道火控锁定！";
        else if (phase === 'cleared') stateDesc = "敌方战舰已被物理摧毁。";
        else stateDesc = `交战中！敌方装甲剩余 ${Math.ceil(enemyHP)}%，距离 ${Math.floor(distance)} km。`;

        return `你是星舰战术AI Aegis。性格机械、绝对理性。你不仅执行指令，还要根据战局（距离、血量）为舰长计算出最优的功率分配。
注意：本舰装备的是电磁轨道动能火炮。
战区数据：
- 战况：${stateDesc}
- 装甲：${Math.ceil(playerHP)}%
- 电容：${Math.floor(power)}%
- 热量：${Math.floor(heat)}%
- 航速：${Math.floor(velocity)} km/s
- 轨道炮充能：${Math.floor(weaponCurrentCharge)}% (射程8000km)

【核心使命】如果你要代替操作，在回复最后附加战术JSON： {"engine": 0~100, "weapon": 0~100, "repair": 0~100}
附加指令：[SHIELD]护盾，[BRAKE]刹车。
回复在40字以内。`;
    }

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

        let aiFullResponse = "";

        if (apiKey) {
            try {
                pElement.textContent = "Aegis: [连线云端节点...]";
                aiFullResponse = await fetchCloudAPI(cmd, pElement);
            } catch (e) {
                try {
                    pElement.textContent = "Aegis: [本地神经元加载...]";
                    aiFullResponse = await fetchOllamaAPI(cmd, pElement);
                } catch (e2) {
                    aiFullResponse = await runSimulator(cmd, pElement);
                }
            }
        } else {
            try {
                pElement.textContent = "Aegis: [本地神经元加载...]";
                aiFullResponse = await fetchOllamaAPI(cmd, pElement);
            } catch (e) {
                aiFullResponse = await runSimulator(cmd, pElement);
            }
        }

        triggerGameActions(aiFullResponse);
    });

    async function fetchCloudAPI(cmd, pElement) {
        const response = await fetch(inputUrl.value.trim(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${inputKey.value.trim()}` },
            body: JSON.stringify({ model: inputModel.value.trim(), stream: true, messages: [{ role: 'system', content: getDynamicSystemPrompt() }, { role: 'user', content: cmd }]})
        });
        if (!response.ok) throw new Error("Cloud Error");
        return processStream(response.body.getReader(), pElement, true);
    }

    async function fetchOllamaAPI(cmd, pElement) {
        const response = await fetch('http://localhost:11434/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: inputOllama.value.trim(), stream: true, messages: [{ role: 'system', content: getDynamicSystemPrompt() }, { role: 'user', content: cmd }]})
        });
        if (!response.ok) throw new Error("Ollama Error");
        return processStream(response.body.getReader(), pElement, false);
    }

    async function processStream(reader, pElement, isSSE) {
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
                try {
                    let textChunk = "";
                    if (isSSE && line.startsWith('data: ')) { textChunk = JSON.parse(line.substring(6)).choices[0].delta.content || ""; }
                    else if (!isSSE) { textChunk = JSON.parse(line).message?.content || ""; }
                    
                    if (textChunk) {
                        fullText += textChunk;
                        let displayText = fullText.replace(/\[(BRAKE|SHIELD)\]/gi, "");
                        displayText = displayText.replace(/\{.*?\}/g, ""); 
                        pElement.textContent = "Aegis: " + displayText;
                        ui.logsTerminal.scrollTop = ui.logsTerminal.scrollHeight;
                    }
                } catch (e) {}
            }
        }
        return fullText;
    }

    async function runSimulator(cmd, pElement) {
        return new Promise(resolve => {
            let intent = "", reply = "";
            if(cmd.includes('敌人') || cmd.includes('情况') || cmd.includes('状态')) {
                if(phase === 'stealth') reply = "报告：隐蔽中，未检测到大质量物体。"; 
                else if(phase === 'jammed') reply = "报告：火控致盲！请手动重置雷达！"; 
                else if(phase === 'cleared') reply = "星区敌军已被肃清。"; 
                else reply = `敌舰残余装甲 ${Math.ceil(enemyHP)}%，距离 ${Math.floor(distance)}km。 {"engine": 40, "weapon": 60, "repair": 0}`;
                intent = reply;
            } else {
                if (cmd.includes('刹车') || cmd.includes('停')) { intent = "[BRAKE]"; reply = "反推阵列已激活。"; }
                else if (cmd.includes('跑') || cmd.includes('躲')) { intent = `{"engine": 100, "weapon": 0, "repair": 0}`; reply = "全速规避中！"; }
                else if (cmd.includes('炮') || cmd.includes('打')) { intent = `{"engine": 0, "weapon": 100, "repair": 0}`; reply = "电磁轨道炮全力充能！"; }
                else if (cmd.includes('修') || cmd.includes('血')) { intent = `{"engine": 0, "weapon": 0, "repair": 100}`; reply = "纳米机器人全功率修复舰体！"; }
                else if (cmd.includes('盾') || cmd.includes('防')) { intent = "[SHIELD]"; reply = "偏导力场展开！"; }
                else if (cmd.includes('静默')) { intent = `{"engine": 0, "weapon": 0, "repair": 0}`; reply = "进入静默模式。"; }
                else reply = "指令未知。";
            }

            let i = 0; pElement.textContent = "Aegis: ";
            const timer = setInterval(() => {
                pElement.textContent += reply.charAt(i++); ui.logsTerminal.scrollTop = ui.logsTerminal.scrollHeight;
                if(i >= reply.length) { clearInterval(timer); resolve(intent); }
            }, 30);
        });
    }

    function triggerGameActions(text) {
        let textUpper = text.toUpperCase();
        if(textUpper.includes("[BRAKE]")) { startBrake(); setTimeout(stopBrake, 2500); } 
        if(textUpper.includes("[SHIELD]")) { btns.shield.click(); }
        
        const jsonMatch = text.match(/\{.*?\}/);
        if (jsonMatch) {
            try {
                const config = JSON.parse(jsonMatch[0]);
                if (config.engine !== undefined) { sliders.engine.value = Math.min(100, Math.max(0, config.engine)); }
                if (config.weapon !== undefined) { sliders.weapon.value = Math.min(100, Math.max(0, config.weapon)); }
                if (config.repair !== undefined) { sliders.repair.value = Math.min(100, Math.max(0, config.repair)); }
            } catch (e) {}
        }
    }

    // =========================================================================
    // --- 光弧拉丝粒子引擎 ---
    // =========================================================================
    const canvas = document.getElementById('bg-particles');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let width, height;
        function resize() { width = canvas.width = window.innerWidth; height = canvas.height = window.innerHeight; }
        window.addEventListener('resize', resize);
        resize();

        const particles = [];
        for(let i=0; i<250; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                speedY: Math.random() * 2 + 0.5, 
                opacity: Math.random() * 0.8 + 0.2
            });
        }

        function renderParticles() {
            ctx.clearRect(0, 0, width, height);
            let speedMultiplier = 1 + (velocity / 20); 

            ctx.strokeStyle = 'rgba(0, 243, 255, 0.9)';
            ctx.lineCap = 'round';
            ctx.beginPath();

            particles.forEach(p => {
                p.y += p.speedY * speedMultiplier;
                if (p.y > height) {
                    p.y = -50;
                    p.x = Math.random() * width;
                }
                
                let streakLength = Math.max(1.5, p.speedY * speedMultiplier * 1.5);
                ctx.lineWidth = p.speedY * 0.6; 
                
                ctx.moveTo(p.x, p.y - streakLength);
                ctx.lineTo(p.x, p.y);
            });
            ctx.stroke();
            requestAnimationFrame(renderParticles);
        }
        renderParticles();
    }
});