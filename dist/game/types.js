"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialState = exports.DEFAULT_GAME_SETTINGS = exports.GamePhase = void 0;

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
})(GamePhase = exports.GamePhase || (exports.GamePhase = {}));

/**
 * Default game settings
 */
exports.DEFAULT_GAME_SETTINGS = {
    minPlayers: 5,
    maxPlayersPerRound: 5,
    clueTimeSeconds: 20,         // Bajamos de 30 a 20
    discussionTimeSeconds: 30,   // Bajamos de 60 a 30
    votingTimeSeconds: 30,       // Bajamos de 45 a 30
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
        settings: Object.assign(Object.assign({}, exports.DEFAULT_GAME_SETTINGS), settings),
    };
}
exports.createInitialState = createInitialState;
