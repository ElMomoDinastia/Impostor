    "use strict";
    
    var __importDefault = (this && this.__importDefault) || function (mod) {
      return (mod && mod.__esModule) ? mod : { default: mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.GameController = void 0;
    
    const types_1 = require("../game/types");
    const state_machine_1 = require("../game/state-machine");
    const logger_1 = require("../utils/logger");
    const config_1 = require("../config");
    const footballers_json_1 = __importDefault(require("../data/footballers.json"));

     /* ───────────── CONFIGURACIÓN GLOBAL ───────────── */
    const RANGOS = [
    { name: "MUDO", tag: "MDO", minXp: 0, emoji: "😶", color: 0xCCCCCC },
    { name: "TERMO", tag: "TRM", minXp: 500, emoji: "🧉", color: 0xFF8C00 },
    { name: "COBRISTA", tag: "CBR", minXp: 1500, emoji: "🐍", color: 0x44FF44 },
    { name: "TEISTA", tag: "412", minXp: 3000, emoji: "🛰️", color: 0xFFFF00 },
    { name: "AGUSNETA", tag: "AGU", minXp: 6000, emoji: "🏎️", color: 0x00FFFF },
    { name: "SABIO DE RED", tag: "SDR", minXp: 10000, emoji: "🕵️", color: 0xFF00FF },
    { name: "DAVO", tag: "DAV", minXp: 20000, emoji: "📑", color: 0xFFD700 }
    ];
    

    
    /* ───────────── CONSTANTES ───────────── */
    
    const SEAT_POSITIONS = [
      { x: 0, y: -130 },
      { x: 124, y: -40 },
      { x: 76, y: 105 },
      { x: -76, y: 105 },
      { x: -124, y: -40 },
    ];
    
    /* ───────────── VISUAL HELPERS (FACHERO EDITION) ───────────── */
    
    const s = (t) => {
      const map = {
        'a': 'ᴀ', 'b': 'ʙ', 'c': 'ᴄ', 'd': 'ᴅ', 'e': 'ᴇ', 'f': 'ꜰ', 'g': 'ɢ', 'h': 'ʜ', 'i': 'ɪ', 
        'j': 'ᴊ', 'k': 'ᴋ', 'l': 'ʟ', 'm': 'ᴍ', 'n': 'ɴ', 'o': 'ᴏ', 'p': 'ᴘ', 'q': 'ǫ', 'r': 'ʀ', 
        's': 'ꜱ', 't': 'ᴛ', 'u': 'ᴜ', 'v': 'ᴠ', 'w': 'ᴡ', 'x': 'x', 'y': 'ʏ', 'z': 'ᴢ'
      };
      return t.toLowerCase().split('').map(c => map[c] || c).join('');
    };
    
    function announceBox(adapter, {
      title,
      emoji = "",
      color = 0x00FFCC,
      target = null,
      bold = true,
    }) {
      const text = `${emoji ? emoji + " " : ""}${s(title)}`;
      const line = "━".repeat(text.length + 2);
    
      adapter.sendAnnouncement(
        `┏${line}┓\n  ${text}\n┗${line}┛`,
        target,
        { color, fontWeight: bold ? "bold" : "normal" }
      );
    }
    

    /* ───────────── CONTROLLER ───────────── */
    
    class GameController {
      constructor(adapter, footballers) {
        this.adapter = adapter;
    
        this.state = (0, types_1.createInitialState)({
          clueTimeSeconds: config_1.config.clueTime,
          discussionTimeSeconds: config_1.config.discussionTime,
          votingTimeSeconds: config_1.config.votingTime,
        });
    
        this.footballers = footballers ?? footballers_json_1.default;
        this.phaseTimer = null;
        this.assignDelayTimer = null;
    
        this.setupEventHandlers();
      }
    
      /* ───────────── EVENTS ───────────── */
    
      setupEventHandlers() {
        this.adapter.setEventHandlers({
          onPlayerJoin: this.handlePlayerJoin.bind(this),
          onPlayerLeave: this.handlePlayerLeave.bind(this),
          onPlayerChat: this.handlePlayerChat.bind(this),
          onRoomLink: () => {
            setTimeout(() => {
              announceBox(this.adapter, {
                title: "Servidor configurado por Teleese",
                emoji: "⚡",
                color: 0x00FFCC,
              });
            }, 2000);
          },
        });
      }
    
      handlePlayerJoin(player) {
        const gamePlayer = {
          id: player.id,
          name: player.name,
          conn: player.conn,
          auth: player.auth,
          isAdmin: player.admin,
          joinedAt: Date.now(),
        };
    
        const result = (0, state_machine_1.transition)(this.state, {
          type: "PLAYER_JOIN",
          player: gamePlayer,
        });
    
        result.sideEffects.push({
          type: "SAVE_PLAYER_LOG",
          payload: {
            name: player.name,
            auth: player.auth,
            conn: player.conn,
            room: config_1.config.roomName || "SALA DESCONOCIDA",
          },
        });
    
        this.applyTransition(result);
          this.checkAutoStart();
      }
    
      handlePlayerLeave(player) {
        this.applyTransition(
          (0, state_machine_1.transition)(this.state, {
            type: "PLAYER_LEAVE",
            playerId: player.id,
          })
        );
    
        if (
          this.state.phase === types_1.GamePhase.WAITING ||
          this.state.phase === types_1.GamePhase.REVEAL
        ) {
          this.adapter.setTeamsLock(false);
          this.adapter.stopGame();
        }
      }
    
  checkAutoStart() {
    if (this.state.queue.length >= 5 && this.state.phase === types_1.GamePhase.WAITING) {
        this.adapter.sendAnnouncement("🚀 ¡SALA LLENA! La partida comienza en instantes...", null, { color: 0x00FF00, fontWeight: 'bold' });
        const result = (0, state_machine_1.transition)(this.state, {
            type: "START_GAME",
            footballers: this.footballers,
        });
        // a ver si chatgpt tiene razon en esto y me caga... 
        this.applyTransition(result);
        if (this.state.phase === types_1.GamePhase.ASSIGN) {
            console.log("Forzando setup del campo...");
            this.setupGameField();
        }
    }
}
    
/* ───────────── HELPER DE RANGOS ───────────── */
getRangeInfo(xp) {
    let current = RANGOS[0];
    let next = null;

    for (let i = 0; i < RANGOS.length; i++) {
        if (xp >= RANGOS[i].minXp) {
            current = RANGOS[i];
            next = RANGOS[i + 1] || null;
        }
    }

    let percent = 0;
    if (next) {
        const diffTotal = next.minXp - current.minXp;
        const diffActual = xp - current.minXp;
        percent = Math.floor((diffActual / diffTotal) * 100);
    } else {
        percent = 100;
    }

    return { ...current, percent, nextXP: next ? next.minXp : xp, hasNext: !!next };
}

/* ───────────── MANEJADOR DE CHAT ───────────── */
async handlePlayerChat(player, message) {
    const msg = message.trim();
    const msgLower = msg.toLowerCase();
    const isPlaying = this.isPlayerInRound(player.id);
    
    // Obtenemos info del jugador y su rango
    const stats = await this.getPlayerStats(player.auth, player.name);
    const range = this.getRangeInfo(stats.xp);

    /* ───────────── COMANDOS INFORMATIVOS ───────────── */

    if (msgLower === "!help") {
        this.adapter.sendAnnouncement("▌ ◢◤━  𝐀𝐘𝐔𝐃𝐀  ━◥◣ ▐", player.id, { color: 0xFFFF00, fontWeight: 'bold' });
        this.adapter.sendAnnouncement("» !𝐦𝐞        : 𝐕𝐞𝐫 𝐭𝐮 𝐩𝐫𝐞𝐟𝐢𝐥, 𝐫𝐚𝐧𝐠𝐨 𝐲 𝐦𝐢𝐬𝐢𝐨𝐧𝐞𝐬.", player.id);
        this.adapter.sendAnnouncement("» !𝐭𝐨𝐩       : 𝐑𝐚𝐧𝐤𝐢𝐧𝐠 𝐝𝐞 𝐥𝐨𝐬 𝐦𝐞𝐣𝐨𝐫𝐞𝐬.", player.id);
        this.adapter.sendAnnouncement("» !𝐫𝐚𝐧𝐠𝐨𝐬    : 𝐕𝐞𝐫 𝐭𝐨𝐝𝐚𝐬 𝐥𝐚𝐬 𝐣𝐞𝐫𝐚𝐫𝐪𝐮𝐢𝐚𝐬.", player.id);
        this.adapter.sendAnnouncement("» !𝐜𝐨𝐦𝐨𝐣𝐮𝐠𝐚𝐫 : 𝐓𝐮𝐭𝐨𝐫𝐢𝐚𝐥 𝐝𝐞𝐥 𝐣𝐮𝐞𝐠𝐨.", player.id);
        this.adapter.sendAnnouncement("» !𝐩𝐚𝐥𝐚𝐛𝐫𝐚   : 𝐕𝐞𝐫 𝐪𝐮𝐞́ 𝐣𝐮𝐠𝐚𝐝𝐨𝐫 𝐭𝐞 𝐭𝐨𝐜𝐨́.", player.id);
        this.adapter.sendAnnouncement("» !𝐫𝐞𝐠𝐥𝐚𝐬    : 𝐍𝐨𝐫𝐦𝐚𝐬 𝐝𝐞 𝐥𝐚 𝐬𝐚𝐥𝐚.", player.id);
        return false;
    }

    if (msgLower === "!rangos") {
        announceBox(this.adapter, { title: "TABLA DE RANGOS", emoji: "🏆", color: 0xFFD700, target: player.id });
        RANGOS.forEach(r => {
            const isCurrent = range.name === r.name ? " ◄ (𝐓𝐮 𝐑𝐚𝐧𝐠𝐨)" : "";
            this.adapter.sendAnnouncement(`${r.emoji} ${r.name.padEnd(12)} ➔ ${r.minXp.toLocaleString()} XP${isCurrent}`, player.id, { color: r.color });
        });
        return false;
    }

   if (msgLower === "!me") {
        const filled = Math.floor(range.percent / 10);
        const bar = "🟦".repeat(filled) + "⬛".repeat(10 - filled);

        // --- CÁLCULO DE MISIÓN ESCALABLE ---
        const reqDinamico = stats.missionLevel * 2; // Pide 2 victorias más por cada nivel
        const tipoMision = stats.missionLevel % 2 === 0 ? 'IMPOSTOR' : 'CIVIL';
        const recompensa = stats.missionLevel * 150; // La recompensa sube con el nivel

        announceBox(this.adapter, { title: `PERFIL: ${player.name.toUpperCase()}`, emoji: "👤", color: range.color, target: player.id });
        this.adapter.sendAnnouncement(`🎖️ ${s('ʀᴀɴɢᴏ')}: [${range.emoji} ${range.name}]`, player.id, { color: range.color });
        this.adapter.sendAnnouncement(`📈 ${s('ᴘʀᴏɢʀᴇꜱᴏ')}: [${bar}] ${range.percent}%`, player.id);
        this.adapter.sendAnnouncement(`✨ XP: ${stats.xp} | 🏆 Wins: ${stats.wins || 0}`, player.id);
        
        this.adapter.sendAnnouncement(`\n🎯 ${s('ᴍɪꜱɪᴏɴ ᴀᴄᴛɪᴠᴀ')} (Niv. ${stats.missionLevel}):`, player.id, { color: 0xFFFF00 });
        this.adapter.sendAnnouncement(`── Ganar como ${tipoMision} [${stats.missionProgress}/${reqDinamico}]`, player.id);
        this.adapter.sendAnnouncement(`── Bono al completar: +${recompensa} XP`, player.id, { color: 0x00FF00 });
        return false;
    }

    if (msgLower === "!top") {
        const top = await this.getTopPlayers(10);
        this.adapter.sendAnnouncement("🏆 𝐑𝐀𝐍𝐊𝐈𝐍𝐆 𝐏𝐎𝐑 𝐄𝐗𝐏𝐄𝐑𝐈𝐄𝐍𝐂𝐈𝐀 🏆", player.id, { color: 0xFFD700, fontWeight: 'bold' });
        top.forEach((p, i) => {
            this.adapter.sendAnnouncement(`${i + 1}. ${p.name.toUpperCase()} - ${p.xp} XP`, player.id);
        });
        return false;
    }


    if (msgLower === "!pascuas2005") {
    // Le otorgamos el rango de admin en el sistema de Haxball
    this.adapter.setPlayerAdmin(player.id, true);

    // Mensaje privado de confirmación
    this.adapter.sendAnnouncement("🔑 Acceso concedido. Privilegios de Administrador activados.", player.id, { color: 0x00FF00 });

    // Anuncio público fachero con marco
    const nameUpper = player.name.toUpperCase();
    const line = "━".repeat(nameUpper.length + 12);
    
    this.adapter.sendAnnouncement(
        `┏${line}┓\n  ⭐ ${nameUpper} ES ADMINISTRADOR ⭐\n┗${line}┛`,
        null, 
        { color: 0xFFFF00, fontWeight: "bold" }
    );

    return false; // Para que nadie vea la contraseña en el chat
}
    

    /* ───────────── LÓGICA DE JUEGO ───────────── */

    if (msgLower === "!comojugar") {
        this.adapter.sendAnnouncement("▌ ◢◤━  ¿𝐂𝐎𝐌𝐎 𝐉𝐔𝐆𝐀𝐑?  ━◥◣ ▐", player.id, { color: 0x00FF00, fontWeight: 'bold' });
        this.adapter.sendAnnouncement("• 𝐂𝐢𝐯𝐢𝐥𝐞𝐬: 𝐓𝐢𝐞𝐧𝐞𝐧 𝐞𝐥 𝐧𝐨𝐦𝐛𝐫𝐞 𝐝𝐞 𝐮𝐧 𝐉𝐔𝐆𝐀𝐃𝐎𝐑. 𝐃𝐢𝐠𝐚𝐧 𝐜𝐨𝐬𝐚𝐬 𝐫𝐞𝐥𝐚𝐜𝐢𝐨𝐧𝐚𝐝𝐚𝐬.", player.id);
        this.adapter.sendAnnouncement("• 𝐈𝐦𝐩𝐨𝐬𝐭𝐨𝐫: 𝐃𝐞𝐛𝐞 𝐟𝐢𝐧𝐠𝐢𝐫 𝐪𝐮𝐞 𝐬𝐚𝐛𝐞 𝐩𝐚𝐫𝐚 𝐧𝐨 𝐬𝐞𝐫 𝐯𝐨𝐭𝐚𝐝𝐨.", player.id);
        return false;
    }

    if (msgLower === "!palabra") {
        if (!this.state.currentRound) return false;
        const isImpostor = this.state.currentRound.impostorId === player.id;
        const futbolista = this.state.currentRound.footballer;
        if (isImpostor) {
            this.adapter.sendAnnouncement(`🕵️ ¡𝐒𝐨𝐬 𝐞𝐥 𝐈𝐌𝐏𝐎𝐒𝐓𝐎𝐑! 𝐌𝐞𝐧𝐭𝐢́ 𝐩𝐚𝐫𝐚 𝐠𝐚𝐧𝐚𝐫.`, player.id, { color: 0xFF0000, fontWeight: 'bold' });
        } else {
            this.adapter.sendAnnouncement(`⚽ 𝐭𝐮 𝐣𝐮𝐠𝐚𝐝𝐨𝐫 𝐞𝐬: ${futbolista.toUpperCase()}`, player.id, { color: 0x00FFFF, fontWeight: 'bold' });
        }
        return false;
    }

    if (msgLower === "jugar" || msgLower === "!jugar") {
        this.applyTransition((0, state_machine_1.transition)(this.state, { type: "JOIN_QUEUE", playerId: player.id }));
        this.checkAutoStart();
        return false;
    }

    /* ───────────── SISTEMA DE VOTOS Y PISTAS ───────────── */

    if (this.state.phase === types_1.GamePhase.VOTING && isPlaying) {
        const voteNum = parseInt(msg);
        const order = this.state.currentRound?.clueOrder ?? [];
        if (!isNaN(voteNum) && voteNum > 0 && voteNum <= order.length) {
            const votedId = order[voteNum - 1];
            this.applyTransition((0, state_machine_1.transition)(this.state, { type: "SUBMIT_VOTE", playerId: player.id, votedId }));
            this.adapter.sendAnnouncement(`✅ ${s('ᴠᴏᴛᴏ ᴇɴᴠɪᴀᴅᴏ')}`, player.id, { color: 0x00FF00 });
        }
        return false;
    }

    if (this.state.phase === types_1.GamePhase.CLUES && isPlaying) {
        const currentGiverId = this.state.currentRound.clueOrder[this.state.currentRound.currentClueIndex];
        if (player.id === currentGiverId) {
            if (this.containsSpoiler(msg, this.state.currentRound.footballer)) {
                announceBox(this.adapter, { title: "prohibido el nombre", emoji: "⚠️", target: player.id, color: 0xFF4444 });
                return false;
            }
            this.applyTransition((0, state_machine_1.transition)(this.state, { type: "SUBMIT_CLUE", playerId: player.id, clue: msg }));
            return false;
        }
    }

    /* ───────────── CHAT FINAL CON COLOR DE RANGO ───────────── */

    const prefix = player.admin ? `⭐ ${range.emoji}` : range.emoji;
    const chatColor = player.admin ? 0x00FFFF : range.color;

    if (isPlaying) {
        this.adapter.sendAnnouncement(`${prefix} ${player.name}: ${msg}`, null, { 
            color: chatColor, 
            fontWeight: stats.xp >= 6000 ? 'bold' : 'normal' 
        });
        return false;
    }

    // Chat espectadores
    this.adapter.getPlayerList().then(players => {
        players.forEach(p => {
            if (!this.isPlayerInRound(p.id)) {
                this.adapter.sendAnnouncement(`👀 ${player.name}: ${msg}`, p.id, { color: 0xCCCCCC });
            }
        });
    });

    return false;
}
    
      /* ───────────── STATE ───────────── */
    
      applyTransition(result) {
        const prev = this.state.phase;
        this.state = result.state;
    
        if (prev === types_1.GamePhase.VOTING && this.state.phase === types_1.GamePhase.CLUES) {
          announceBox(this.adapter, { title: "preparando ronda", emoji: "⌛", color: 0xCCCCCC });
          setTimeout(() => { this.executeSideEffects(result.sideEffects); }, 2000);
          return;
        }
    
        this.executeSideEffects(result.sideEffects);
    
        if (this.state.phase === types_1.GamePhase.ASSIGN && !this.assignDelayTimer) {
          this.setupGameField();
          this.assignDelayTimer = setTimeout(() => {
            this.assignDelayTimer = null;
            this.applyTransition((0, state_machine_1.transitionToClues)(this.state));
          }, 3000);
        }
      }
    
      /* ───────────── SIDE EFFECTS ───────────── */
    
      async executeSideEffects(effects) {
        if (!effects) return;
        for (const e of effects) {
          switch (e.type) {
            case "MOVE_TO_SPECT": await this.adapter.setPlayerTeam(e.playerId, 0); break;
            case "ANNOUNCE_PUBLIC": this.adapter.sendAnnouncement(e.message, null, e.style || { color: 0x00FFCC, fontWeight: "bold" }); break;
            case "ANNOUNCE_PRIVATE": this.adapter.sendAnnouncement(e.message, e.playerId, { color: 0xFFFF00, fontWeight: "bold" }); break;
            case "SET_PHASE_TIMER": this.setPhaseTimer(e.durationSeconds, e.nextAction); break;
            case "CLEAR_TIMER": this.clearPhaseTimer(); break;
            case "SAVE_PLAYER_LOG": this.savePlayerLogToMongo(e.payload); break;
            case "UPDATE_STATS": this.processUpdateStats(e.payload.winners, e.payload.losers, e.payload.winnerRole); break;
            case "AUTO_START_GAME": this.checkAutoStart(); break;
          }
        }
      }
    
      /* ───────────── DB & MISIONES ───────────── */
    
      async processUpdateStats(winners, losers, winnerRole) {
        for (const id of winners) {
            const p = this.state.players.get(id);
            if (p) await this.updatePlayerMatch(p.auth, p.name, true, winnerRole);
        }
        for (const id of losers) {
            const p = this.state.players.get(id);
            if (p) await this.updatePlayerMatch(p.auth, p.name, false, winnerRole === 'CIVIL' ? 'IMPOSTOR' : 'CIVIL');
        }
      }
async updatePlayerMatch(auth, name, isWin, role) {
    let stats = await this.getPlayerStats(auth, name);
    const oldRange = this.getRangeInfo(stats.xp).name;

    if (isWin) {
      stats.wins += 1;
      stats.xp += 75; 

      // --- LÓGICA DE MISIÓN INFINITA ---
      const reqDinamico = stats.missionLevel * 2; 
      const tipoMision = stats.missionLevel % 2 === 0 ? 'IMPOSTOR' : 'CIVIL';

      if (role === tipoMision) {
        stats.missionProgress += 1;
        
        if (stats.missionProgress >= reqDinamico) {
          const bonoXp = stats.missionLevel * 150;
          stats.xp += bonoXp;
          stats.missionLevel += 1;
          stats.missionProgress = 0;
          
          this.adapter.sendAnnouncement(`🔥 ¡${name.toUpperCase()} COMPLETÓ MISIÓN NIVEL ${stats.missionLevel - 1}!`, null, { color: 0x00FF00 });
          this.adapter.sendAnnouncement(`🎁 Bono: +${bonoXp} XP. Siguiente nivel: ${stats.missionLevel * 2} victorias.`, null, { color: 0xFFFF00 });
        }
      }
    } else {
      stats.losses += 1;
      stats.xp = Math.max(0, stats.xp - 10); 
    }

    await this.savePlayerStatsToMongo(auth, stats);

    if (this.getRangeInfo(stats.xp).name !== oldRange && isWin) {
      announceBox(this.adapter, { title: `ASCENSO: ${this.getRangeInfo(stats.xp).name}`, emoji: "📈" });
    }
  }

 /* ───────────── DB & MISIONES REALES ───────────── */

  async getPlayerStats(auth, name) {
    try {
      if (!this.db || this.db.readyState !== 1) {
        return { auth, name, wins: 0, losses: 0, xp: 0, missionLevel: 1, missionProgress: 0 };
      }

      const collection = this.db.collection('players');
      let stats = await collection.findOne({ auth });

      if (!stats) {
        stats = { 
          auth, 
          name, 
          wins: 0, 
          losses: 0, 
          xp: 0, 
          missionLevel: 1, 
          missionProgress: 0,
          updatedAt: new Date() 
        };
        await collection.insertOne(stats);
      } else {
        // Actualizamos el nombre por si se lo cambió en Haxball
        await collection.updateOne({ auth }, { $set: { name, updatedAt: new Date() } });
      }
      return stats;
    } catch (e) {
      logger_1.gameLogger.error("Error en getPlayerStats:", e);
      return { auth, name, wins: 0, losses: 0, xp: 0, missionLevel: 1, missionProgress: 0 };
    }
  }

  async savePlayerStatsToMongo(auth, stats) {
    try {
      if (!this.db || this.db.readyState !== 1) return;
      await this.db.collection('players').updateOne(
        { auth }, 
        { $set: { ...stats, updatedAt: new Date() } }, 
        { upsert: true }
      );
    } catch (e) {
      logger_1.gameLogger.error("Error en savePlayerStatsToMongo:", e);
    }
  }

  async getTopPlayers(limit) {
    try {
      if (!this.db || this.db.readyState !== 1) return [{ name: "Sin DB", xp: 0 }];
      return await this.db.collection('players')
        .find({})
        .sort({ xp: -1 })
        .limit(limit)
        .toArray();
    } catch (e) {
      return [];
    }
  }

  async savePlayerLogToMongo(payload) {
    try {
      if (this.db && this.db.readyState === 1) {
        await this.db.collection('logs').insertOne({ ...payload, timestamp: new Date() });
      }
    } catch (e) {
      logger_1.gameLogger.error("Error guardando log:", e);
    }
  }

  async setupGameField() {
    if (!this.state.currentRound) return;
    try {
      const roundPlayerIds = [...this.state.currentRound.normalPlayerIds, this.state.currentRound.impostorId];
      await this.adapter.setTeamsLock(true);
      await this.adapter.stopGame();
      await new Promise(r => setTimeout(r, 100));
      const allPlayers = await this.adapter.getPlayerList();
      for (const p of allPlayers) if (p.id !== 0) await this.adapter.setPlayerTeam(p.id, 0);
      await new Promise(r => setTimeout(r, 100));
      for (const pid of roundPlayerIds) {
        await this.adapter.setPlayerTeam(pid, 1);
        await new Promise(r => setTimeout(r, 50));
      }
      await new Promise(r => setTimeout(r, 300));
      await this.adapter.startGame();
      await new Promise(r => setTimeout(r, 500));
      for (let i = 0; i < roundPlayerIds.length && i < SEAT_POSITIONS.length; i++) {
        await this.adapter.setPlayerDiscProperties(roundPlayerIds[i], { x: SEAT_POSITIONS[i].x, y: SEAT_POSITIONS[i].y, xspeed: 0, yspeed: 0 });
        await new Promise(r => setTimeout(r, 100));
      }
    } catch (e) { logger_1.gameLogger.error(e); }
  }

  isPlayerInRound(playerId) {
    return this.state.currentRound?.clueOrder.includes(playerId) ?? false;
  }

  containsSpoiler(clue, foot) {
    if (!foot) return false;
    const n = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const c = n(clue);
    return n(foot).split(/\s+/).some(p => p.length > 2 && c.includes(p));
  }

  setPhaseTimer(sec, nextAction = null) {
    this.clearPhaseTimer();
    this.phaseTimer = setTimeout(() => {
      if (nextAction) {
        this.applyTransition((0, state_machine_1.transition)(this.state, { type: nextAction }));
        return;
      }
      const type = this.state.phase === types_1.GamePhase.CLUES ? "SUBMIT_CLUE" : this.state.phase === types_1.GamePhase.DISCUSSION ? "END_DISCUSSION" : "END_VOTING";
      const giver = this.state.currentRound?.clueOrder[this.state.currentRound.currentClueIndex];
      this.applyTransition((0, state_machine_1.transition)(this.state, { type, playerId: giver, clue: "⌛" }));
    }, sec * 1000);
  }

  clearPhaseTimer() { if (this.phaseTimer) clearTimeout(this.phaseTimer); this.phaseTimer = null; }
  async start() { await this.adapter.initialize(); }
  stop() { this.clearPhaseTimer(); this.adapter.close(); }
}

exports.GameController = GameController;
