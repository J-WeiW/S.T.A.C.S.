document.addEventListener('DOMContentLoaded', () => {
    const sfx = {
        radar: new Audio('audio/sonarping.mp3'),
        charge: new Audio('audio/sci-fi-weapon-charging.mp3'),
        fire: new Audio('audio/cannon-shot.mp3'),
        shield: new Audio('audio/sci-fi-charge-up.mp3'),
        alarm: new Audio('audio/warning-alarm-loop.mp3'),
        ambient: new Audio('audio/spaceship-ambient.mp3'),
        engineRunning: new Audio('audio/spaceship-engine-running.mp3'),
        impact: new Audio('audio/hi-huge-cinematic-reverb-impact.mp3'),
        impactEnemy: new Audio('audio/hi-huge-cinematic-reverb-impact.mp3') 
    };
    sfx.ambient.loop = true;
    sfx.alarm.loop = true;
    sfx.engineRunning.loop = true;
    sfx.engineRunning.volume = 0;

    function playSound(audioObj) {
        audioObj.currentTime = 0;
        audioObj.play().catch(e => console.warn("Audio blocked:", e));
    }

    let phase = 'stealth'; 
    let power = 100.0, heat = 15.0, playerHP = 100, enemyHP = 100;
    let velocity = 0, distance = 15000, weaponCurrentCharge = 0;
    const weaponRange = 8000; 
    let isBraking = false, isParrying = false;
    let evasionRate = 0, accuracyRate = 100;
    let enemyAttackTimer = 0, isIncomingAttack = false, wasIncomingAttack = false;
    let ewarScore = 0, enemyStunnedTimer = 0;
    let prevWeaponDrain = 0, prevEnginePower = 0;

    const ui = {
        initScreen: document.getElementById('init-screen'), btnBoot: document.getElementById('btn-boot'), cockpitGrid: document.getElementById('cockpit-grid'),
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
        logsNarrative: document.getElementById('narrative-logs'), logsTerminal: document.getElementById('terminal-logs')
    };

    const sliders = { engine: document.getElementById('engine-slider'), weapon: document.getElementById('weapon-slider'), repair: document.getElementById('repair-slider') };
    const btns = { radar: document.getElementById('btn-radar'), shield: document.getElementById('btn-shield'), fire: document.getElementById('btn-fire'), brake: document.getElementById('btn-brake') };

    const initDataStream = document.getElementById('init-data-stream');
    const fakeLogs = ["Mounting file systems...", "Loading neural network weights...", "Establishing secure comms...", "Reactor cores online...", "Warp drive: Standby.", "All systems nominal."];
    let logIndex = 0;
    const bootInterval = setInterval(() => {
        if(logIndex < fakeLogs.length) {
            if(initDataStream) initDataStream.innerHTML += "<br>> " + fakeLogs[logIndex++];
        } else clearInterval(bootInterval);
    }, 400);

    if(ui.btnBoot) {
        ui.btnBoot.addEventListener('click', () => {
            ui.initScreen.classList.add('hidden');
            ui.cockpitGrid.style.filter = "blur(0)";
            ui.cockpitGrid.style.opacity = "1";
            ui.cockpitGrid.style.pointerEvents = "all";
            sfx.ambient.play().catch(e => {});
            startGameLoop();
        });
    }

    function logMsg(target, text, className) {
        const p = document.createElement('p'); p.className = className; p.textContent = text;
        target.appendChild(p); target.scrollTop = target.scrollHeight;
    }

    sliders.engine.addEventListener('change', (e) => {
        let currentPower = parseInt(e.target.value);
        if (currentPower > prevEnginePower) { sfx.engineDown?.pause(); playSound(sfx.engineUp); } 
        else if (currentPower < prevEnginePower) { sfx.engineUp?.pause(); playSound(sfx.engineDown); }
        prevEnginePower = currentPower;
    });

    sliders.weapon.addEventListener('input', (e) => {
        let currentDrain = parseInt(e.target.value);
        if (currentDrain > 0 && prevWeaponDrain === 0) { playSound(sfx.charge); }
        prevWeaponDrain = currentDrain;
    });

    const configPanel = document.getElementById('api-config-panel');
    const inputUrl = document.getElementById('api-url'), inputModel = document.getElementById('api-model'), inputKey = document.getElementById('api-key'), inputOllama = document.getElementById('ollama-model');
    if (localStorage.getItem('stacs_api_url')) inputUrl.value = localStorage.getItem('stacs_api_url');
    if (localStorage.getItem('stacs_api_model')) inputModel.value = localStorage.getItem('stacs_api_model');
    if (localStorage.getItem('stacs_api_key')) inputKey.value = localStorage.getItem('stacs_api_key');
    if (localStorage.getItem('stacs_ollama_model')) inputOllama.value = localStorage.getItem('stacs_ollama_model');
    document.getElementById('btn-config-toggle').addEventListener('click', () => { configPanel.style.display = configPanel.style.display === 'none' ? 'flex' : 'none'; });
    document.getElementById('btn-save-config').addEventListener('click', () => {
        localStorage.setItem('stacs_api_url', inputUrl.value.trim()); localStorage.setItem('stacs_api_model', inputModel.value.trim());
        localStorage.setItem('stacs_api_key', inputKey.value.trim()); localStorage.setItem('stacs_ollama_model', inputOllama.value.trim());
        configPanel.style.display = 'none'; logMsg(ui.logsTerminal, "[ SYS_CFG ] Configuration saved to local registry.", "system-msg");
    });

    const btnMic = document.getElementById('btn-mic'); const inputCmd = document.getElementById('ai-command-input');
    let isRecording = false; const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        let recognition = new SpeechRecognition(); recognition.lang = 'zh-CN'; recognition.continuous = false;
        recognition.onstart = function() { isRecording = true; btnMic.classList.add('mic-active'); inputCmd.placeholder = "LISTENING // 侦听中..."; };
        recognition.onresult = function(event) { inputCmd.value = event.results[0][0].transcript; document.getElementById('btn-ai-send').click(); };
        recognition.onend = function() { isRecording = false; btnMic.classList.remove('mic-active'); inputCmd.placeholder = "AWAITING COMMAND // 输入自然语言指令..."; };
        btnMic.addEventListener('click', () => { isRecording ? recognition.stop() : recognition.start(); });
    } else { btnMic.style.display = 'none'; }

    const startBrake = () => { 
        isBraking = true; btns.brake.classList.add('active-brake'); 
        if(prevEnginePower > 0) { sfx.engineUp?.pause(); playSound(sfx.engineDown); }
    };
    const stopBrake = () => { 
        isBraking = false; btns.brake.classList.remove('active-brake'); 
        if(prevEnginePower > 0) { sfx.engineDown?.pause(); playSound(sfx.engineUp); }
    };
    btns.brake.addEventListener('mousedown', startBrake); btns.brake.addEventListener('mouseup', stopBrake); btns.brake.addEventListener('mouseleave', stopBrake);

    function discoverEnemy() {
        if(phase === 'combat' || playerHP <= 0) return;
        phase = 'combat'; 
        ui.phaseText.textContent = "[ SYS_MODE: COMBAT // 交战协议 ]"; ui.phaseText.className = "phase-combat";
        ui.enemyBlock.style.opacity = "1"; ui.enemyBlip.style.display = "block"; ui.distanceContainer.style.opacity = "1";
        ui.enemyHpFill.style.width = `${enemyHP}%`; ui.enemyHpText.textContent = `${Math.ceil(enemyHP)} / 100`;
        logMsg(ui.logsNarrative, "[ TARGET_LOCKED ] Hostile mass detected. Weapons free // 发现敌方质量体，火控解锁。", "story-msg");
    }

    function loseTarget() {
        if(phase !== 'combat') return;
        phase = 'jammed'; ui.phaseText.textContent = "[ SYS_MODE: JAMMED // 信号丢失 ]"; ui.phaseText.className = "phase-jammed";
        ui.enemyBlock.style.opacity = "0.2"; ui.enemyBlip.style.display = "none"; isIncomingAttack = false; btns.fire.disabled = true; btns.fire.classList.remove('ready');
        ui.distanceContainer.style.opacity = "0.3"; ui.distanceVal.textContent = "ERR"; ui.attackAlert.style.display = "none"; 
        logMsg(ui.logsTerminal, "[ SENSOR_FAILURE ] Telemetry lost. E-Warfare jamming active // 遥测丢失，受到强电磁干扰。", "warn-msg");
    }

    function takeDamage(amount) {
        playerHP = Math.max(0, playerHP - amount);
        ui.hpFill.style.width = `${playerHP}%`; ui.hpText.textContent = `${Math.ceil(playerHP)} / 100`;
        
        playSound(sfx.impact); 
        ui.overlay.classList.add('damage'); 
        ui.cockpitGrid.classList.add('impact-fx');
        
        setTimeout(() => { 
            if(playerHP > 0) ui.overlay.classList.remove('damage'); 
            ui.cockpitGrid.classList.remove('impact-fx');
        }, 400);

        if(playerHP <= 0) { 
            phase = 'gameover'; ui.overlay.className = "fx-overlay destroyed"; ui.gameOverText.style.display = "block"; ui.enemyBlip.style.display = "none";
            ui.attackAlert.style.display = "none"; sfx.alarm.pause();
            logMsg(ui.logsNarrative, "[ FATAL_ERROR ] Reactor containment breached. Abandon ship // 反应堆壳体破裂，全舰覆没。", "story-msg"); 
        }
    }

    function startGameLoop() {
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
            
            if (velocity > 0) {
                if (sfx.engineRunning.paused) { sfx.engineRunning.play().catch(e => {}); }
                let targetVol = Math.min(1.0, 0.2 + (velocity / 1000) * 0.8);
                if (sfx.engineRunning.volume < targetVol) { sfx.engineRunning.volume = Math.min(targetVol, sfx.engineRunning.volume + 0.05); } 
                else if (sfx.engineRunning.volume > targetVol) { sfx.engineRunning.volume = Math.max(targetVol, sfx.engineRunning.volume - 0.05); }
            } else {
                if (!sfx.engineRunning.paused) {
                    sfx.engineRunning.volume = Math.max(0, sfx.engineRunning.volume - 0.1);
                    if (sfx.engineRunning.volume <= 0.01) { sfx.engineRunning.volume = 0; sfx.engineRunning.pause(); }
                }
            }

            if(phase === 'combat' || phase === 'jammed') {
                distance = Math.max(2000, distance - (velocity / 10) + 20); 
                let blipDist = Math.min(140, (distance / 15000) * 140); 
                ui.enemyBlip.style.top = `${140 - blipDist}px`; 
            }

            ui.velocityVal.textContent = Math.floor(velocity);
            if (phase === 'combat') { ui.distanceVal.textContent = Math.floor(distance); ui.distanceVal.className = (distance <= weaponRange) ? "cyan-text" : "orange-text"; } 
            else if (phase === 'stealth' || phase === 'cleared') { ui.distanceVal.textContent = "---"; ui.distanceVal.className = ""; }

            evasionRate = (velocity / 1000) * 50; accuracyRate = 100 - (velocity / 1000) * 50; 
            ui.evasionText.textContent = `EVASION: ${Math.floor(evasionRate)}%`; ui.accuracyText.textContent = `ACCURACY: ${Math.floor(accuracyRate)}%`;

            let netPower = 3.0 - (enginePower / 100) * 4.0 - (weaponDrain / 100) * 5.0 - (repairPower / 100) * 6.0;
            let netHeat = -2.0 + (enginePower / 100) * 3.0 + (weaponDrain / 100) * 3.0 + (repairPower / 100) * 4.0;
            
            power = Math.min(100, Math.max(0, power + netPower / 10)); 
            heat = Math.min(100, Math.max(0, heat + netHeat / 10));

            if(power <= 0) { sliders.engine.value = 0; sliders.weapon.value = 0; sliders.repair.value = 0;}
            
            if(heat >= 100) { ui.overlay.classList.add('overheat'); takeDamage(0.5); } else ui.overlay.classList.remove('overheat');
            if((phase === 'stealth' || phase === 'cleared') && heat >= 65) {
                if(phase === 'cleared') { distance = 15000; enemyHP = 100; logMsg(ui.logsTerminal, "[ THERMAL_ALERT ] Venting sequence failed. Heat signature exposed // 热量超载，行踪暴露。", "warn-msg"); }
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

            if((phase === 'combat' || phase === 'jammed') && enemyStunnedTimer <= 0) {
                if(!isIncomingAttack && distance <= weaponRange && Math.random() < 0.015) { 
                    isIncomingAttack = true; enemyAttackTimer = Math.max(2.0, 4.0 - (weaponRange - distance)/4000); 
                    ui.attackAlert.style.display = "block"; 
                }
                
                if (isIncomingAttack && !wasIncomingAttack) { sfx.alarm.currentTime = 0; sfx.alarm.play().catch(e=>{}); wasIncomingAttack = true; } 
                else if (!isIncomingAttack && wasIncomingAttack) { sfx.alarm.pause(); wasIncomingAttack = false; }

                if(isIncomingAttack) {
                    enemyAttackTimer -= 0.1; 
                    ui.attackCountdown.textContent = Math.max(0, enemyAttackTimer).toFixed(1); 
                    if(enemyAttackTimer <= 0) {
                        isIncomingAttack = false; ui.attackAlert.style.display = "none"; 
                        if(isParrying) { logMsg(ui.logsTerminal, "[ DEFLECTED ] Projectile trajectory altered // 成功偏转弹体。", "ai-msg"); ui.overlay.className = "fx-overlay parry"; setTimeout(() => { if(playerHP > 0) ui.overlay.className = "fx-overlay"; }, 500); heat = Math.max(0, heat - 20); } 
                        else if (Math.random() * 100 < evasionRate) { logMsg(ui.logsTerminal, "[ EVADED ] Projectile missed // 规避成功。", "ai-msg"); } 
                        else { logMsg(ui.logsTerminal, "[ HULL_DAMAGE ] Kinetic impact sustained // 舰体遭到动能打击！", "danger-msg"); takeDamage(25); }
                    }
                }
            }
        }, 100);

        renderParticles();
    }

    btns.radar.addEventListener('click', () => {
        if(power < 10 || playerHP <= 0) return; power -= 10; heat += 25; 
        playSound(sfx.radar);
        logMsg(ui.logsTerminal, "[ SCAN_INITIATED ] Broadcasting wide-band pulse... // 广播宽频脉冲...", "system-msg");
        let previousPhase = phase;
        if(phase === 'stealth' || phase === 'jammed' || phase === 'cleared') { 
            setTimeout(() => { 
                if(previousPhase === 'jammed') { logMsg(ui.logsTerminal, "[ SENSOR_RESET ] Telemetry re-established // 遥测信号重新连接。", "ai-msg"); ewarScore = 0; }
                if(previousPhase === 'cleared') { distance = 15000; enemyHP = 100; logMsg(ui.logsTerminal, "[ WARP_DETECTED ] New hostile signature acquired // 捕获到新的折跃信号。", "warn-msg"); }
                discoverEnemy(); 
            }, 800); 
        }
    });

    btns.shield.addEventListener('click', () => {
        if(power < 15 || isParrying) return; power -= 15; isParrying = true;
        playSound(sfx.shield);
        btns.shield.classList.add('active'); btns.shield.textContent = "DEFLECTOR ACTIVE..."; setTimeout(() => { isParrying = false; btns.shield.classList.remove('active'); btns.shield.textContent = "DEFLECTOR // 偏导场"; }, 1000); 
    });

    btns.fire.addEventListener('click', () => {
        if(weaponCurrentCharge < 100 || phase !== 'combat' || distance > weaponRange) return;
        
        heat += 30; weaponCurrentCharge = 0; sliders.weapon.value = 0; ui.weaponFill.style.width = "0%"; btns.fire.disabled = true; btns.fire.classList.remove('ready');
        
        playSound(sfx.fire); 
        
        ui.overlay.classList.add('firing');
        ui.cockpitGrid.classList.add('recoil-fx');
        setTimeout(() => {
            ui.overlay.classList.remove('firing');
            ui.cockpitGrid.classList.remove('recoil-fx');
        }, 250);

        if(Math.random() * 100 < accuracyRate) {
            playSound(sfx.impactEnemy); 
            logMsg(ui.logsNarrative, "[ HIT_CONFIRMED ] Target hull integrity compromised // 动能撞击确认，目标装甲受损。", "story-msg");
            enemyHP -= 25; 
            if(enemyHP <= 0) { 
                enemyHP = 0; phase = 'cleared'; ui.enemyBlip.style.display = "none";
                isIncomingAttack = false; ui.attackAlert.style.display = "none";
                logMsg(ui.logsNarrative, "[ TARGET_DESTROYED ] Hostile unit neutralized // 目标质量体已摧毁。", "story-msg"); 
                ui.phaseText.textContent = "[ SYS_MODE: SECURED // 星区肃清 ]"; ui.phaseText.style.color = "var(--green)"; ui.distanceContainer.style.opacity = "0.3"; ui.distanceVal.textContent = "---";
            }
            ui.enemyHpFill.style.width = `${enemyHP}%`; ui.enemyHpText.textContent = `${Math.ceil(enemyHP)} / 100`;
        } else { 
            logMsg(ui.logsNarrative, "[ MISS ] Trajectory deviation detected // 轨道偏差，未命中。", "story-msg");
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
                if(ewarScore >= 100) { ewarScore = 0; enemyStunnedTimer = 6.0; logMsg(ui.logsTerminal, "[ E-WAR_SUCCESS ] Logic bomb injected. Target FCS disabled // 逻辑木马注入，敌方火控熔断。", "ai-msg"); }
                setTimeout(() => this.classList.remove('safe'), 200);
            }
        });
    });

    // =========================================================================
    // --- 动态全知上下文系统 ---
    // =========================================================================
    function getDynamicSystemPrompt() {
        let stateDesc = "";
        if (phase === 'stealth') stateDesc = "SYS_MODE: STEALTH. No targets.";
        else if (phase === 'jammed') stateDesc = "SYS_MODE: JAMMED. Telemetry lost.";
        else if (phase === 'cleared') stateDesc = "SYS_MODE: SECURED. Area cleared.";
        else stateDesc = `SYS_MODE: COMBAT. Target Hull: ${Math.ceil(enemyHP)}%, Range: ${Math.floor(distance)}km.`;

        return `你是星舰战术指挥系统 S.T.A.C.S. (Spacecraft Tactical Command System)。响应必须是极度冰冷的机器数据流风格，中英双语混合。例如：'[ CMD_ACK ] 收到指令，正在执行。'
本舰装备：KINETIC RAILGUN (电磁轨道动能火炮)。
战区数据：
- ${stateDesc}
- HULL: ${Math.ceil(playerHP)}%
- CAPACITOR: ${Math.floor(power)}%
- THERMAL: ${Math.floor(heat)}%
- VELOCITY: ${Math.floor(velocity)} km/s
- WEAPON_CHARGE: ${Math.floor(weaponCurrentCharge)}% (有效射程: 8000km)

【权限系统】若需调整底层物理模块，请在回复最后附加JSON格式数据： {"engine": 0~100, "weapon": 0~100, "repair": 0~100}
附加动作指令：[SHIELD] 部署偏导场, [BRAKE] 紧急反推。
回复需简短冷酷（40字内），绝对不要使用 Markdown 代码块。`;
    }

    document.getElementById('btn-ai-send').addEventListener('click', async () => {
        const cmd = inputCmd.value.trim();
        if(!cmd) return;
        logMsg(ui.logsTerminal, `CMD_INPUT: ${cmd}`, 'system-msg');
        inputCmd.value = '';

        const apiKey = inputKey.value.trim();
        const pElement = document.createElement('p');
        pElement.className = "ai-msg";
        ui.logsTerminal.appendChild(pElement);
        ui.logsTerminal.scrollTop = ui.logsTerminal.scrollHeight;

        let aiFullResponse = "";

        if (apiKey) {
            try {
                pElement.textContent = "S.T.A.C.S: [ CONNECTING TO CLOUD NODE... ]";
                aiFullResponse = await fetchCloudAPI(cmd, pElement);
            } catch (e) {
                try { pElement.textContent = "S.T.A.C.S: [ LOADING LOCAL MATRIX... ]"; aiFullResponse = await fetchOllamaAPI(cmd, pElement); } 
                catch (e2) { aiFullResponse = await runSimulator(cmd, pElement); }
            }
        } else {
            try { pElement.textContent = "S.T.A.C.S: [ LOADING LOCAL MATRIX... ]"; aiFullResponse = await fetchOllamaAPI(cmd, pElement); } 
            catch (e) { aiFullResponse = await runSimulator(cmd, pElement); }
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
                        pElement.textContent = "S.T.A.C.S: " + displayText;
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
                if(phase === 'stealth') reply = "[ SYS_INFO ] Stealth mode active. No targets. // 隐蔽中。"; 
                else if(phase === 'jammed') reply = "[ SYS_ERR ] Sensor blinded. Manual reset required. // 致盲状态！"; 
                else if(phase === 'cleared') reply = "[ SYS_INFO ] Sector secured. // 星区已安全。"; 
                else reply = `[ TACTICAL ] Hostile hull at ${Math.ceil(enemyHP)}%, Range ${Math.floor(distance)}km. {"engine": 40, "weapon": 60, "repair": 0}`;
                intent = reply;
            } else {
                if (cmd.includes('刹车') || cmd.includes('停')) { intent = "[BRAKE]"; reply = "[ CMD_ACK ] Retro-thrusters engaged. // 反推阵列激活。"; }
                else if (cmd.includes('跑') || cmd.includes('躲')) { intent = `{"engine": 100, "weapon": 0, "repair": 0}`; reply = "[ CMD_ACK ] Evasive maneuvers authorized. // 满舵规避中。"; }
                else if (cmd.includes('炮') || cmd.includes('打')) { intent = `{"engine": 0, "weapon": 100, "repair": 0}`; reply = "[ CMD_ACK ] Railgun capacitor charging. // 轨道炮充能。"; }
                else if (cmd.includes('修') || cmd.includes('血')) { intent = `{"engine": 0, "weapon": 0, "repair": 100}`; reply = "[ CMD_ACK ] Nano-repair protocol active. // 修复阵列启动。"; }
                else if (cmd.includes('盾') || cmd.includes('防')) { intent = "[SHIELD]"; reply = "[ CMD_ACK ] Deflector field expanding. // 偏导力场展开。"; }
                else if (cmd.includes('静默')) { intent = `{"engine": 0, "weapon": 0, "repair": 0}`; reply = "[ CMD_ACK ] Silent running protocol active. // 进入静默模式。"; }
                else reply = "[ SYS_ERR ] Command unrecognized. // 指令未知。";
            }

            let i = 0; pElement.textContent = "S.T.A.C.S: ";
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
                if (config.engine !== undefined) { sliders.engine.value = Math.min(100, Math.max(0, config.engine)); prevEnginePower = config.engine; }
                if (config.weapon !== undefined) { sliders.weapon.value = Math.min(100, Math.max(0, config.weapon)); prevWeaponDrain = config.weapon; }
                if (config.repair !== undefined) { sliders.repair.value = Math.min(100, Math.max(0, config.repair)); }
            } catch (e) {}
        }
    }

    const canvas = document.getElementById('bg-particles');
    let ctx = null;
    let width, height;
    let particles = [];
    
    if (canvas) {
        ctx = canvas.getContext('2d');
        function resize() { width = canvas.width = window.innerWidth; height = canvas.height = window.innerHeight; }
        window.addEventListener('resize', resize);
        resize();

        for(let i=0; i<250; i++) {
            particles.push({ x: Math.random() * width, y: Math.random() * height, speedY: Math.random() * 2 + 0.5, opacity: Math.random() * 0.8 + 0.2 });
        }
    }

    function renderParticles() {
        if (!ctx) return;
        ctx.clearRect(0, 0, width, height);
        let speedMultiplier = 1 + (velocity / 20); 
        ctx.strokeStyle = 'rgba(0, 243, 255, 0.9)'; ctx.lineCap = 'round'; ctx.beginPath();

        particles.forEach(p => {
            p.y += p.speedY * speedMultiplier;
            if (p.y > height) { p.y = -50; p.x = Math.random() * width; }
            let streakLength = Math.max(1.5, p.speedY * speedMultiplier * 1.5);
            ctx.lineWidth = p.speedY * 0.6; 
            ctx.moveTo(p.x, p.y - streakLength); ctx.lineTo(p.x, p.y);
        });
        ctx.stroke(); requestAnimationFrame(renderParticles);
    }
});