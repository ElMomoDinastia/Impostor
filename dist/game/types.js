"use strict";
/**
 * Game Types for HaxBall Impostor Game
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_GAME_SETTINGS = exports.GamePhase = void 0;
exports.createInitialState = createInitialState;
/**
 * Game phases following the state machine pattern
 */
var GamePhase;
(function (GamePhase) {
    GamePhase["WAITING"] = "WAITING";
    GamePhase["ASSIGN"] = "ASSIGN";
    GamePhase["CLUES"] = "CLUES";
    GamePhase["DISCUSSION"] = "DISCUSSION";
    GamePhase["VOTING"] = "VOTING";
    GamePhase["REVEAL"] = "REVEAL";
    GamePhase["RESULTS"] = "RESULTS";
})(GamePhase || (exports.GamePhase = GamePhase = {}));
/**
 * Default game settings
 */
exports.DEFAULT_GAME_SETTINGS = {
    minPlayers: 5,
    maxPlayersPerRound: 5,
    clueTimeSeconds: 15, // Bajamos de 30 a 20 (es solo una palabra)
    discussionTimeSeconds: 30, // Bajamos de 60 a 30 (habrá varios debates)
    votingTimeSeconds: 20, // Bajamos de 45 a 30
};
/**
 * Initial game state factory
 */
function createInitialState(settings) {
    return {
        phase: GamePhase.WAITING,
        players: new Map(),
        queue: [],
        currentRound: null,
        roundHistory: [],
        settings: { ...exports.DEFAULT_GAME_SETTINGS, ...settings },
    };
}
//# sourceMappingURL=types.js.map
