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
    constructor(adapter, footballers, db) {
    this.adapter = adapter;
    this.db = db;
    
    this.joinedAt = Date.now(); 
    
    this.state = (0, types_1.createInitialState)({
        clueTimeSeconds: config_1.config.clueTime,
        discussionTimeSeconds: config_1.config.discussionTime,
        votingTimeSeconds: config_1.config.votingTime,
    });
    this.footballers = footballers ?? footballers_json_1.default;
    this.phaseTimer = null;
    this.assignDelayTimer = null;
    this.skipVotes = new Set();
    this.setupEventHandlers();
    this.startDiscordAdvertisement(); 
    this.checkForTakeover(); 
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
        // 🛡️ --- SISTEMA ANTI-MULTIS ---
        // Obtenemos todos los jugadores que ya están en el estado del bot
        const allPlayers = Array.from(this.state.players.values());
        
        // Buscamos si alguno tiene el mismo AUTH o el mismo CONN
        const isMulti = allPlayers.find(p => p.auth === player.auth || p.conn === player.conn);

        if (isMulti) {
            this.adapter.kickPlayer(player.id, "❌ ANTI-MULTI: Ya hay una cuenta activa con tus datos.", false);
            console.log(`[SEGURIDAD] Intento de multi bloqueado: ${player.name} | Auth: ${player.auth}`);
            return; // Detenemos la ejecución para que no se sume a la partida
        }
        // ------------------------------

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
    
    // CORRECCIÓN: En Map se usa .get(id). Si no existe, usamos el objeto player directo.
    const roomPlayer = this.state.players.get(player.id);
    const validAuth = roomPlayer ? roomPlayer.auth : player.auth;
    const validName = roomPlayer ? roomPlayer.name : player.name;

    // Pedimos stats frescas de la DB
    const stats = await this.getPlayerStats(validAuth, validName);
    const range = this.getRangeInfo(stats.xp);

   /* ───────────── COMANDOS INFORMATIVOS (MEJORADO) ───────────── */
    if (msgLower === "!help") {
        // Encabezado fachero
        this.adapter.sendAnnouncement("▌ ◢◤━  𝐀𝐘𝐔𝐃𝐀 𝐆𝐄𝐍𝐄𝐑𝐀𝐋  ━◥◣ ▐", player.id, { color: 0xFFFF00, fontWeight: 'bold' });
        this.adapter.sendAnnouncement("👤 " + s("ᴜꜱᴜᴀʀɪᴏ"), player.id, { color: 0x00FFCC, fontWeight: 'bold' });
        this.adapter.sendAnnouncement("» !me      : Perfil, rango y progreso de misión.", player.id);
        this.adapter.sendAnnouncement("» !comojugar      : Te explica como jugar si sos alto pete", player.id);
        this.adapter.sendAnnouncement("» !top     : Ranking global de los mejores (XP).", player.id);
        this.adapter.sendAnnouncement("» !rangos  : Lista de todas las jerarquías.", player.id);     
        this.adapter.sendAnnouncement("» !discord : Puedes ver el link de discord (!discord).", player.id);
        this.adapter.sendAnnouncement("🎮 " + s("ᴊᴜᴇɢᴏ"), player.id, { color: 0x00FFCC, fontWeight: 'bold' });
        this.adapter.sendAnnouncement("» !jugar   : Entrar a la lista de espera (cola).", player.id);
        this.adapter.sendAnnouncement("» !como     : Guía rápida de roles y dinámica.", player.id);
        this.adapter.sendAnnouncement("» !reglas  : Normas básicas de convivencia.", player.id);
        this.adapter.sendAnnouncement("» !palabra : Te recuerda tu jugador (solo si jugás).", player.id);
        this.adapter.sendAnnouncement("» !votar   : Votar para saltar el debate (!skip).", player.id);

        return false;
    }


    if (msgLower === "!discord") {
    const title = "ᴜɴɪᴛᴇ ᴀʟ ᴅɪꜱᴄᴏʀᴅ";
    const discordLink = "dsc.gg/Impostores";

    this.adapter.sendAnnouncement(
        `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n  💙 ${s(title)}\n  🔗 ${discordLink}\n┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
        player.id, 
        { color: 0x5865F2, fontWeight: "bold" }
    );
    return false;
    }


  /* ───────────── COMANDOS DE ADMINISTRACIÓN ───────────── */

if (msgLower === "!start" || msgLower === "!forzar") {
    if (!player.admin) {
        this.adapter.sendAnnouncement("❌ No tenés permisos para forzar el inicio.", player.id, { color: 0xFF4444 });
        return false;
    }
    if (this.state.phase !== types_1.GamePhase.WAITING) {
        this.adapter.sendAnnouncement("⚠️ La partida ya está en curso.", player.id, { color: 0xFFFF00 });
        return false;
    }
    if (this.state.queue.length === 0) {
        this.adapter.sendAnnouncement("🚫 No hay nadie en cola.", player.id, { color: 0xFF4444 });
        return false;
    }

    this.adapter.sendAnnouncement(`🛠️ ${player.name.toUpperCase()} FORZÓ EL INICIO.`, null, { color: 0xFFFF00, fontWeight: 'bold' });
    const result = (0, state_machine_1.transition)(this.state, { type: "START_GAME", footballers: this.footballers });
    this.applyTransition(result);
    if (this.state.phase === types_1.GamePhase.ASSIGN) this.setupGameField();
    return false;
}

if (msgLower === "!stop" || msgLower === "!cancelar") {
    if (!player.admin) {
        this.adapter.sendAnnouncement("❌ No podés detener la partida.", player.id, { color: 0xFF4444 });
        return false;
    }
    
    this.adapter.sendAnnouncement("🛑 PARTIDA CANCELADA POR EL ADMIN", null, { color: 0xFF0000, fontWeight: 'bold' });
    
    this.adapter.stopGame();
    this.adapter.setTeamsLock(false);
    
    const allPlayers = await this.adapter.getPlayerList();
    for (const p of allPlayers) {
        if (p.id !== 0) await this.adapter.setPlayerTeam(p.id, 0);
    }

    // Reiniciamos el estado del controlador
    this.state.phase = types_1.GamePhase.WAITING;
    this.state.currentRound = null;
    this.clearPhaseTimer();
    
    return false;
}


if (msgLower === "!clearbans" || msgLower === "!unbanall") {
    if (!player.admin) {
        this.adapter.sendAnnouncement("❌ No tenés permisos para limpiar los baneos.", player.id, { color: 0xFF4444 });
        return false;
    }

    this.adapter.clearBans();
    
    announceBox(this.adapter, { 
        title: "BANEOS LIMPIADOS", 
        emoji: "🔓", 
        color: 0x00FF00 
    });

    console.log(`[ADMIN] ${player.name} limpió la lista de baneos.`);
    return false;
}

    if (msgLower === "!me") {
        const filled = Math.floor(range.percent / 10);
        const bar = "🟦".repeat(filled) + "⬛".repeat(10 - filled);
        const reqDinamico = stats.missionLevel * 2;
        const tipoMision = stats.missionLevel % 2 === 0 ? 'IMPOSTOR' : 'CIVIL';

        announceBox(this.adapter, { 
            title: `PERFIL: ${stats.name.toUpperCase()}`, 
            emoji: range.emoji, 
            color: range.color, 
            target: player.id 
        });
        this.adapter.sendAnnouncement(`🎖️ ${s('ʀᴀɴɢᴏ')}: [${range.emoji} ${range.name}]`, player.id, { color: range.color });
        this.adapter.sendAnnouncement(`📈 ${s('ᴘʀᴏɢʀᴇꜱᴏ')}: [${bar}] ${range.percent}%`, player.id);
        this.adapter.sendAnnouncement(`✨ XP: ${stats.xp} | 🏆 Wins: ${stats.wins || 0}`, player.id);
        this.adapter.sendAnnouncement(`🎯 Misión: Ganar como ${tipoMision} [${stats.missionProgress}/${reqDinamico}]`, player.id, { color: 0xFFFF00 });
        return false;
    }
    

    if (msgLower === "!debugdb") {
        const status = this.db ? this.db.readyState : "NULL";
        const estados = { 0: "❌ Desconectado", 1: "✅ Conectado", 2: "⏳ Conectando", 3: "🔌 Desconectando", "NULL": "🚫 No inicializada" };
        this.adapter.sendAnnouncement(`🛠️ [DEBUG] Estado DB: ${estados[status] || status}`, player.id, { color: 0xFFFFFF });
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

if (msgLower === "!votar" || msgLower === "!skip") {
    // 1. Validar que estemos en debate
    if (this.state.phase !== types_1.GamePhase.DISCUSSION) {
        this.adapter.sendAnnouncement("⚠️ Solo podés usar !votar durante el debate.", player.id, { color: 0xFF4444 });
        return false;
    }

    // 2. Validar que el jugador esté jugando y vivo
    if (!this.isPlayerInRound(player.id)) {
        this.adapter.sendAnnouncement("❌ Solo los jugadores activos pueden votar.", player.id, { color: 0xFF4444 });
        return false;
    }

    // 3. Evitar que el mismo jugador vote dos veces
    if (this.skipVotes.has(player.id)) {
        this.adapter.sendAnnouncement("⏳ Ya votaste. Esperá a los demás.", player.id, { color: 0xFFFF00 });
        return false;
    }

    // AGREGAR EL VOTO (Ahora sí persiste porque no lo reseteamos arriba)
    this.skipVotes.add(player.id);

    const vivos = this.state.currentRound.clueOrder.length;
    const requeridos = Math.floor(vivos / 2) + 1;
    const actuales = this.skipVotes.size;

    this.adapter.sendAnnouncement(`🗳️ ${player.name} quiere saltar [${actuales}/${requeridos}]`, null, { color: 0x00FFCC });

    // 4. Si se llega a la mayoría, saltar fase
    if (actuales >= requeridos) {
        this.adapter.sendAnnouncement("⏩ Mayoría alcanzada. Saltando a la votación...", null, { color: 0xFFFF00, fontWeight: "bold" });
        this.skipVotes.clear(); 
        this.applyTransition((0, state_machine_1.transition)(this.state, { type: "END_DISCUSSION" }));
    }

    return false;
}

 if (msgLower === "!comojugar") {
        this.adapter.sendAnnouncement("▌ ◢◤━  ¿𝐂𝐎𝐌𝐎 𝐉𝐔𝐆𝐀𝐑?  ━◥◣ ▐", player.id, { color: 0x00FF00, fontWeight: 'bold' });
        this.adapter.sendAnnouncement("Escribi Jugar para entrar a la partida siguiente :)", player.id, { color: 0x00FF00, fontWeight: 'bold' });
        this.adapter.sendAnnouncement("🎭 ROLES:", player.id, { color: 0xFFFF00 });
        this.adapter.sendAnnouncement("- ⚽ FUTBOLISTA: Sabes el nombre. Da pistas sin revelarlo.", player.id);
        this.adapter.sendAnnouncement("- 🕵️ IMPOSTOR: No sabes nada. Fingí y miente para encajar.", player.id);
        this.adapter.sendAnnouncement("\n🎮 DINÁMICA:", player.id, { color: 0xFFFF00 });
        this.adapter.sendAnnouncement("1. Ronda de 5 jugadores. Cada uno da 1 pista.", player.id);
        this.adapter.sendAnnouncement("2. Al final, debaten y votan por el número del impostor.", player.id);
        this.adapter.sendAnnouncement("\n🏆 OBJETIVOS:", player.id, { color: 0xFFFF00 });
        this.adapter.sendAnnouncement("- Civiles: Votar al impostor.", player.id);
        this.adapter.sendAnnouncement("- Impostor: Sobrevivir a la votación.", player.id);
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

    if (msgLower === "!rangos") {
        this.adapter.sendAnnouncement("📋 𝐉𝐄𝐑𝐀𝐑𝐐𝐔𝐈𝐀𝐒 𝐃𝐄𝐋 𝐒𝐄𝐑𝐕𝐈𝐃𝐎𝐑:", player.id, { color: 0xFFFFFF, fontWeight: 'bold' });
        RANGOS.forEach(r => {
            this.adapter.sendAnnouncement(`${r.emoji} ${r.name}: ${r.minXp} XP`, player.id, { color: r.color });
        });
        return false;
    }

if (this.state.phase === types_1.GamePhase.CLUES && isPlaying) {
    const round = this.state.currentRound;
    const currentGiverId = round.clueOrder[round.currentClueIndex];

    if (player.id === currentGiverId) {
        if (this.containsSpoiler(msg, round.footballer)) {
            announceBox(this.adapter, { title: "prohibido el nombre", emoji: "⚠️", target: player.id, color: 0xFF4444 });
            return false;
        }
        this.applyTransition((0, state_machine_1.transition)(this.state, { type: "SUBMIT_CLUE", playerId: player.id, clue: msg }));
        return false;
    } else {
        this.adapter.sendAnnouncement("⚠️ NO ES TU TURNO", player.id, { color: 0xFF0000, fontWeight: "bold" });
        return false; 
    }
}
if (msgLower === "!reglas") {
        this.adapter.sendAnnouncement("▌ ◢◤━  𝐑𝐄𝐆𝐋𝐀𝐒  ━◥◣ ▐", player.id, { color: 0xFF4444, fontWeight: 'bold' });
        this.adapter.sendAnnouncement("1. Prohibido decir el nombre del jugador.", player.id);
        this.adapter.sendAnnouncement("2. No revelar pistas siendo espectador.", player.id);
        return false;
    }

const prefix = player.admin ? `⭐ ${range.emoji}` : range.emoji;
    const chatColor = player.admin ? 0x00FFFF : range.color;

    if (isPlaying) {
        // Mensaje global para los que están en la ronda
        this.adapter.sendAnnouncement(`${prefix} ${player.name}: ${msg}`, null, { 
            color: chatColor, 
            fontWeight: stats.xp >= 6000 ? 'bold' : 'normal' 
        });
    } else {
        // Chat para espectadores
        const allPlayers = await this.adapter.getPlayerList();
        allPlayers.forEach(p => {
            if (!this.isPlayerInRound(p.id)) {
                this.adapter.sendAnnouncement(`👀 ${prefix} ${player.name}: ${msg}`, p.id, { color: 0xCCCCCC });
            }
        });
    }
    return false;
}
/* ───────────── MÉTODOS DE SISTEMA ───────────── */

async checkForTakeover() {
    setInterval(async () => {
        try {
            const roomId = process.env.ROOM_ID || "0";
            if (!this.db || this.db.readyState !== 1) return;
            
            const collection = this.db.db.collection('system_state');
            const signal = await collection.findOne({ type: `takeover_signal_${roomId}` });

            if (signal && signal.active && signal.timestamp > this.joinedAt) {
                console.log(`[Sala ${roomId}] 🔄 Relevo detectado. Cerrando bot viejo...`);
                this.adapter.sendAnnouncement("🔄 REINICIO: Actualizando servidor...", null, {color: 0xFFCC00, fontWeight: 'bold'});
                
                setTimeout(() => this.stop(), 5000);
            }
        } catch (e) { /* ignore */ }
    }, 20000);
}
    
      /* ───────────── STATE ───────────── */
    
      applyTransition(result) {
    const prev = this.state.phase;
    this.state = result.state;

    if (prev !== this.state.phase) {
        this.skipVotes.clear();
    }
    
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
            console.error("❌ DB no conectada. Estado:", this.db?.readyState);
            return { auth, name, wins: 0, losses: 0, xp: 0, missionLevel: 1, missionProgress: 0 };
        }

        const collection = this.db.db.collection('players');
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
            console.log(`✨ Nuevo jugador registrado: ${name}`);
        } else {
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
        
        await this.db.db.collection('players').updateOne(
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
        
        // Usamos this.db.db.collection
        return await this.db.db.collection('players')
            .find({})
            .sort({ xp: -1 })
            .limit(limit)
            .toArray();
    } catch (e) {
        return [];
    }
}

startDiscordAdvertisement() {
    setInterval(() => {
        const discordLink = "dsc.gg/Impostores";
        const title = "ᴜɴɪᴛᴇ ᴀʟ ᴅɪꜱᴄᴏʀᴅ";
        
        this.adapter.sendAnnouncement(
            `┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n  💙 ${s(title)}\n  🔗 ${discordLink}\n┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
            null, // null para que lo vean todos
            { color: 0x5865F2, fontWeight: "bold" } // Azul desenfocado (Blurple) original de Discord
        );
    }, 180000);
}

async savePlayerLogToMongo(payload) {
    try {
        if (this.db && this.db.readyState === 1) {
            await this.db.db.collection('logs').insertOne({ ...payload, timestamp: new Date() });
        }
    } catch (e) {
        logger_1.gameLogger.error("Error guardando log:", e);
    }
}

  async setupGameField() {
    if (!this.state.currentRound || !this.state.currentRound.clueOrder) return;
    
    try {
      const roundPlayerIds = this.state.currentRound.clueOrder; 

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
        await this.adapter.setPlayerDiscProperties(roundPlayerIds[i], { 
          x: SEAT_POSITIONS[i].x, 
          y: SEAT_POSITIONS[i].y, 
          xspeed: 0, 
          yspeed: 0 
        });
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
  stop() { 
    this.clearPhaseTimer(); 
    this.adapter.close(); 
    setTimeout(() => {
        process.exit(0);
    }, 2000);
  }
} 

exports.GameController = GameController;
