"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HBRoomAdapter = void 0;
exports.createHBRoomAdapter = createHBRoomAdapter;

const puppeteer_extra_1 = __importDefault(require("puppeteer-extra"));
const puppeteer_extra_plugin_stealth_1 = __importDefault(require("puppeteer-extra-plugin-stealth"));
puppeteer_extra_1.default.use((0, puppeteer_extra_plugin_stealth_1.default)());

const logger_1 = require("../utils/logger");
const HAXBALL_HEADLESS_URL = 'https://www.haxball.com/headless';

class HBRoomAdapter {
    browser = null;
    page = null;
    roomLink = null;
    handlers = {};
    config;
    initialized = false;
    pollingInterval = null;
    constructor(config) {
        this.config = config;
    }
    async initialize() {
        if (this.initialized) {
            logger_1.roomLogger.warn('Room adapter already initialized');
            return;
        }
        logger_1.roomLogger.info({ roomName: this.config.roomName }, 'Initializing HaxBall room with Puppeteer Extra (Stealth)...');
        try {
            this.browser = await puppeteer_extra_1.default.launch({
                headless: "new",
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-features=WebRtcHideLocalIpsWithMdns',
                    '--disable-gpu',
                    '--disable-software-rasterizer',
                    '--use-fake-ui-for-media-stream',
                    '--use-fake-device-for-media-stream',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins',
                    '--disable-site-isolation-trials',
                    '--ignore-certificate-errors',
                    '--allow-running-insecure-content',
                ],
            });
            this.page = await this.browser.newPage();
            this.page.on('console', (msg) => {
                const text = msg.text();
                if (text.includes('[HaxBall]')) {
                    logger_1.roomLogger.debug({ browserLog: text }, 'Browser console');
                }
            });
            logger_1.roomLogger.info('Navigating to HaxBall headless page...');
            await this.page.goto(HAXBALL_HEADLESS_URL, { waitUntil: 'networkidle0', timeout: 30000 });
            await this.page.waitForFunction('typeof HBInit === "function"', { timeout: 30000 });
            logger_1.roomLogger.info('HBInit API is ready');

           
            const roomNumber = this.config.roomNumber || 1;
            const latBase = -34.5630760192871;
            const offset = (roomNumber - 1) * 0.001; 

            const roomConfig = {
                roomName: this.config.roomName,
                maxPlayers: this.config.maxPlayers,
                noPlayer: false, 
                token: this.config.token || '',
                public: this.config.public ?? true,
                password: this.config.password || null,
                geo: { 
                    "code": "ar", 
                    "lat": latBase - offset, 
                    "lon": -58.4608917236328 
                }
            };

            logger_1.roomLogger.info({ config: { ...roomConfig, token: '[REDACTED]' } }, 'Creating HaxBall room...');
            const roomLink = await this.page.evaluate(async (config) => {
                return new Promise((resolve, reject) => {
                    try {
                        const room = HBInit(config);
                        window.__haxRoom = room;
                        window.__haxEvents = [];
                        room.onPlayerJoin = (player) => {
                            window.__haxEvents.push({ type: 'playerJoin', player });
                        };
                        room.onPlayerLeave = (player) => {
                            window.__haxEvents.push({ type: 'playerLeave', player });
                        };
                        room.onPlayerChat = (player, message) => {
                            window.__haxEvents.push({ type: 'playerChat', player, message });
                            return false;
                        };
                        room.onRoomLink = (link) => {
                            resolve(link);
                        };
                        setTimeout(() => {
                            reject(new Error('Timeout waiting for room link'));
                        }, 60000);
                    }
                    catch (err) {
                        reject(err);
                    }
                });
            }, roomConfig);
            this.roomLink = roomLink;
            this.initialized = true;
            logger_1.roomLogger.info({ link: roomLink }, '🎮 HaxBall room created successfully!');
            await this.loadDefaultStadium();
            this.startEventPolling();
            if (this.handlers.onRoomLink) {
                this.handlers.onRoomLink(roomLink);
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('HaxBall room initialization error:', error);
            logger_1.roomLogger.error({ error: errorMessage }, 'Failed to initialize HaxBall room');
            await this.close();
            throw error;
        }
    }
    async loadDefaultStadium() {
        if (!this.page)
            return;
        try {
            const stadiumJson = JSON.stringify({
                "name": "Mesa Impostor by Teleese",
                "width": 400,
                "height": 400,
                "spawnDistance": 0,
                "bg": { "type": "grass", "width": 400, "height": 400, "kickOffRadius": 0 },
                "playerPhysics": {
                    "radius": 15,
                    "acceleration": 0,
                    "kickingAcceleration": 0,
                    "kickStrength": 12,
                    "damping": 0.96,
                    "invMass": 0.5,
                    "kickingDamping": 0.96
                },
                "ballPhysics": { "radius": 10, "invMass": 0.5, "damping": 0.99, "color": "FFFFFF" },
                "vertexes": [],
                "segments": [],
                "discs": [
                    { "pos": [0, -130], "radius": 30, "invMass": 0, "color": "transparent", "cGroup": ["c0"], "cMask": ["ball"] },
                    { "pos": [124, -40], "radius": 30, "invMass": 0, "color": "transparent", "cGroup": ["c0"], "cMask": ["ball"] },
                    { "pos": [76, 105], "radius": 30, "invMass": 0, "color": "transparent", "cGroup": ["c0"], "cMask": ["ball"] },
                    { "pos": [-76, 105], "radius": 30, "invMass": 0, "color": "transparent", "cGroup": ["c0"], "cMask": ["ball"] },
                    { "pos": [-124, -40], "radius": 30, "invMass": 0, "color": "transparent", "cGroup": ["c0"], "cMask": ["ball"] },
                    { "pos": [0, 0], "radius": 35, "invMass": 0, "color": "2D3748", "cGroup": ["wall"], "cMask": ["all"] }
                ],
                "planes": [
                    { "normal": [0, 1], "dist": -400, "cMask": ["all"] },
                    { "normal": [0, -1], "dist": -400, "cMask": ["all"] },
                    { "normal": [1, 0], "dist": -400, "cMask": ["all"] },
                    { "normal": [-1, 0], "dist": -400, "cMask": ["all"] }
                ],
                "goals": [],
                "spawns": [{ "x": 0, "y": 0, "team": "red" }],
                "balls": [{ "pos": [0, 0], "color": "FFFFFF" }],
                "traits": {}
            });
            await this.page.evaluate((stadium) => {
                window.__haxRoom?.setCustomStadium(stadium);
            }, stadiumJson);
            logger_1.roomLogger.info('Custom Impostor stadium loaded');
        }
        catch (error) {
            logger_1.roomLogger.error({ error }, 'Failed to load default stadium');
        }
    }
    startEventPolling() {
        this.pollingInterval = setInterval(async () => {
            if (!this.page || !this.initialized)
                return;
            try {
                const events = await this.page.evaluate(() => {
                    const evts = window.__haxEvents || [];
                    window.__haxEvents = [];
                    return evts;
                });
                for (const event of events) {
                    this.handleEvent(event);
                }
            }
            catch (error) {
                logger_1.roomLogger.debug('Event polling error (page may be closed)');
            }
        }, 100);
    }
    handleEvent(event) {
        switch (event.type) {
            case 'playerJoin':
                if (event.player) {
                    logger_1.roomLogger.info({ playerId: event.player.id, name: event.player.name }, 'Player joined');
                    this.handlers.onPlayerJoin?.(event.player);
                }
                break;
            case 'playerLeave':
                if (event.player) {
                    logger_1.roomLogger.info({ playerId: event.player.id, name: event.player.name }, 'Player left');
                    this.handlers.onPlayerLeave?.(event.player);
                }
                break;
            case 'playerChat':
                if (event.player && event.message !== undefined) {
                    logger_1.roomLogger.debug({ playerId: event.player.id, message: event.message }, 'Player chat');
                    this.handlers.onPlayerChat?.(event.player, event.message);
                }
                break;
        }
    }
    isInitialized() { return this.initialized; }
    getRoomLink() { return this.roomLink; }
    async getPlayerList() {
        if (!this.page || !this.initialized) return [];
        try {
            return await this.page.evaluate(() => {
                return window.__haxRoom?.getPlayerList() || [];
            });
        } catch { return []; }
    }
    async getPlayer(id) {
        if (!this.page || !this.initialized) return null;
        try {
            return await this.page.evaluate((playerId) => {
                return window.__haxRoom?.getPlayer(playerId) || null;
            }, id);
        } catch { return null; }
    }
    async setPlayerAdmin(playerId, admin) {
        if (!this.page || !this.initialized) return;
        try {
            await this.page.evaluate((id, isAdmin) => {
                window.__haxRoom?.setPlayerAdmin(id, isAdmin);
            }, playerId, admin);
        } catch (error) {
            logger_1.roomLogger.error({ playerId, error }, 'Failed to set player admin');
        }
    }
    async setPlayerTeam(playerId, team) {
        if (!this.page || !this.initialized) return;
        try {
            await this.page.evaluate((id, t) => {
                window.__haxRoom?.setPlayerTeam(id, t);
            }, playerId, team);
        } catch (error) {
            logger_1.roomLogger.error({ playerId, error }, 'Failed to set player team');
        }
    }
    async kickPlayer(playerId, reason, ban = false) {
        if (!this.page || !this.initialized) return;
        try {
            await this.page.evaluate((id, r, b) => {
                window.__haxRoom?.kickPlayer(id, r, b);
            }, playerId, reason, ban);
        } catch (error) {
            logger_1.roomLogger.error({ playerId, error }, 'Failed to kick player');
        }
    }
    async sendChat(message, targetId) {
        if (!this.page || !this.initialized) return;
        try {
            await this.page.evaluate((msg, tid) => {
                window.__haxRoom?.sendChat(msg, tid);
            }, message, targetId);
        } catch (error) {
            logger_1.roomLogger.error({ error }, 'Failed to send chat');
        }
    }
    async sendAnnouncement(message, targetId, options) {
        if (!this.page || !this.initialized) return;
        try {
            await this.page.evaluate((msg, tid, opts) => {
                window.__haxRoom?.sendAnnouncement(msg, tid, opts?.color, opts?.style, opts?.sound);
            }, message, targetId, options);
        } catch (error) {
            logger_1.roomLogger.error({ error }, 'Failed to send announcement');
        }
    }
    setEventHandlers(handlers) { this.handlers = handlers; }
    async setCustomStadium(stadium) {
        if (!this.page || !this.initialized) return;
        try {
            await this.page.evaluate((stadiumJson) => {
                window.__haxRoom?.setCustomStadium(stadiumJson);
            }, stadium);
        } catch (error) {
            logger_1.roomLogger.error({ error }, 'Failed to set custom stadium');
        }
    }
    async setPlayerDiscProperties(playerId, props) {
        if (!this.page || !this.initialized) return;
        try {
            await this.page.evaluate((id, properties) => {
                window.__haxRoom?.setPlayerDiscProperties(id, properties);
            }, playerId, props);
        } catch (error) {
            logger_1.roomLogger.error({ playerId, error }, 'Failed to set player disc properties');
        }
    }
    async startGame() {
        if (!this.page || !this.initialized) return;
        try { await this.page.evaluate(() => { window.__haxRoom?.startGame(); });
        } catch (error) { logger_1.roomLogger.error({ error }, 'Failed to start game'); }
    }
    async stopGame() {
        if (!this.page || !this.initialized) return;
        try { await this.page.evaluate(() => { window.__haxRoom?.stopGame(); });
        } catch (error) { logger_1.roomLogger.error({ error }, 'Failed to stop game'); }
    }
    async setTeamsLock(locked) {
        if (!this.page || !this.initialized) return;
        try {
            await this.page.evaluate((isLocked) => {
                window.__haxRoom?.setTeamsLock(isLocked);
            }, locked);
            logger_1.roomLogger.info({ locked }, 'Teams lock set');
        } catch (error) {
            logger_1.roomLogger.error({ error }, 'Failed to set teams lock');
        }
    }
    async close() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        if (this.page) {
            try { await this.page.close(); } catch {}
            this.page = null;
        }
        if (this.browser) {
            try { await this.browser.close(); } catch {}
            this.browser = null;
        }
        this.roomLink = null;
        this.initialized = false;
        logger_1.roomLogger.info('Room adapter closed');
    }
}
exports.HBRoomAdapter = HBRoomAdapter;
function createHBRoomAdapter(config) {
    return new HBRoomAdapter(config);
}
