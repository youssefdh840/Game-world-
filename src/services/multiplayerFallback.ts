import { Peer, DataConnection } from 'peerjs';
import { GameRoom, UserProfile, GameCategory, ChatMessage, Question } from '../types/game';
import { getClientSessionId } from '../utils/session';
import { fetchDynamicGameQuestions } from './questionService';

// Fallback in-memory map
const inMemoryRooms = new Map<string, GameRoom>();
const activePeerConnections = new Map<string, DataConnection>();
let activeHostPeer: Peer | null = null;
let activeGuestPeer: Peer | null = null;

// Cross-tab Broadcast Channel
let broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    broadcastChannel = new BroadcastChannel('wc_multiplayer_broker');
  } catch (err) {
    console.warn('BroadcastChannel initialization note:', err);
  }
}

export type FallbackMessage =
  | { type: 'ROOM_SYNC'; room: GameRoom }
  | { type: 'GUEST_JOIN'; roomId: string; guest: Partial<UserProfile>; guestSessionId: string }
  | { type: 'MATCH_READY'; roomId: string; room: GameRoom; startTime: number; hostSessionId: string }
  | { type: 'MATCH_ACK'; roomId: string; guestSessionId: string; timestamp: number }
  | { type: 'GAME_START'; roomId: string; room: GameRoom; startTime: number }
  | { type: 'GAME_START_CONFIRMED'; roomId: string; guestSessionId: string; timestamp: number }
  | { type: 'PLAYER_ANSWER'; roomId: string; isHost: boolean; answer: string; answerTime: number; scoreDelta: number }
  | { type: 'ADVANCE_ROUND'; roomId: string; nextRound: number; nextQuestion?: Question; timestamp: number }
  | { type: 'CHAT_MSG'; roomId: string; message: ChatMessage }
  | { type: 'QUEUE_ANNOUNCE'; room: GameRoom; sessionId: string };

// Subscribed listeners
type FallbackRoomListener = (room: GameRoom) => void;
type FallbackChatListener = (msg: ChatMessage) => void;
export type FallbackHandshakeListener = (msg: FallbackMessage) => void;

const roomListeners = new Map<string, Set<FallbackRoomListener>>();
const chatListeners = new Map<string, Set<FallbackChatListener>>();
const handshakeListeners = new Map<string, Set<FallbackHandshakeListener>>();

// Subscribe to two-way handshake events (MATCH_READY, MATCH_ACK, GAME_START, GAME_START_CONFIRMED, GUEST_JOIN)
export function subscribeToFallbackHandshake(
  roomIdOrCode: string,
  onHandshake: FallbackHandshakeListener
): () => void {
  const clean = roomIdOrCode.trim();
  const keys = [clean, clean.toUpperCase(), `room_code_${clean.toUpperCase()}`, '*'];
  keys.forEach((k) => {
    if (!handshakeListeners.has(k)) handshakeListeners.set(k, new Set());
    handshakeListeners.get(k)!.add(onHandshake);
  });
  return () => {
    keys.forEach((k) => {
      handshakeListeners.get(k)?.delete(onHandshake);
    });
  };
}

function notifyHandshakeListeners(roomId: string, msg: FallbackMessage) {
  const clean = (roomId || '').trim();
  const candidates = [clean, clean.toUpperCase(), `room_code_${clean.toUpperCase()}`, '*'];
  const notified = new Set<FallbackHandshakeListener>();
  candidates.forEach((k) => {
    const set = handshakeListeners.get(k);
    if (set) {
      set.forEach((fn) => {
        if (!notified.has(fn)) {
          notified.add(fn);
          try {
            fn(msg);
          } catch (err) {
            console.warn('Handshake listener note:', err);
          }
        }
      });
    }
  });
}

// Notify registered in-app listeners
function notifyRoomListeners(room: GameRoom) {
  const listeners = roomListeners.get(room.id);
  if (listeners) {
    listeners.forEach((fn) => {
      try {
        fn(room);
      } catch (err) {
        console.warn('Error in fallback room listener:', err);
      }
    });
  }
}

function notifyChatListeners(roomId: string, msg: ChatMessage) {
  const listeners = chatListeners.get(roomId);
  if (listeners) {
    listeners.forEach((fn) => {
      try {
        fn(msg);
      } catch (err) {
        console.warn('Error in fallback chat listener:', err);
      }
    });
  }
}

// Global broadcast dispatcher (BroadcastChannel + localStorage storage event + WebRTC peers)
export function broadcastFallbackMessage(msg: FallbackMessage) {
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage(msg);
    } catch {
      // ignore
    }
  }
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('wc_msg_bus', JSON.stringify({ msg, t: Date.now(), r: Math.random() }));
    } catch {
      // ignore
    }
  }
  // Send via active WebRTC peer connections (broadcast to all open data channels)
  activePeerConnections.forEach((conn) => {
    if (conn && conn.open) {
      try {
        conn.send(msg);
      } catch {
        // ignore
      }
    }
  });
}

// Receive and handle incoming broadcast/storage messages
function handleIncomingMessage(msg: FallbackMessage) {
  if (!msg || !msg.type) return;

  const targetRoomId = 'roomId' in msg ? msg.roomId : 'room' in msg ? msg.room.id : '';
  if (targetRoomId) {
    notifyHandshakeListeners(targetRoomId, msg);
  } else {
    notifyHandshakeListeners('*', msg);
  }

  if (msg.type === 'ROOM_SYNC') {
    saveFallbackRoom(msg.room, false);
    notifyRoomListeners(msg.room);
  } else if (msg.type === 'MATCH_READY' || msg.type === 'GAME_START') {
    const updated: GameRoom = {
      ...msg.room,
      roundStartTime: msg.startTime || msg.room.roundStartTime,
      roundStartedAt: msg.startTime || msg.room.roundStartedAt,
      status: 'ready' as const,
    };
    saveFallbackRoom(updated, false);
    notifyRoomListeners(updated);
  } else if (msg.type === 'MATCH_ACK' || msg.type === 'GAME_START_CONFIRMED') {
    const current = getFallbackRoom(msg.roomId);
    if (current) {
      const updated: GameRoom = {
        ...current,
        guestAck: true,
      };
      saveFallbackRoom(updated, false);
      notifyRoomListeners(updated);
    }
  } else if (msg.type === 'PLAYER_ANSWER') {
    const current = getFallbackRoom(msg.roomId);
    if (current) {
      const updated = { ...current };
      if (msg.isHost) {
        updated.hostAnswer = msg.answer;
        updated.hostAnswerTime = msg.answerTime;
        if (msg.scoreDelta > 0) updated.hostScore = (updated.hostScore || 0) + msg.scoreDelta;
      } else {
        updated.guestAnswer = msg.answer;
        updated.guestAnswerTime = msg.answerTime;
        if (msg.scoreDelta > 0) updated.guestScore = (updated.guestScore || 0) + msg.scoreDelta;
      }
      saveFallbackRoom(updated, false);
      notifyRoomListeners(updated);
    }
  } else if (msg.type === 'ADVANCE_ROUND') {
    const current = getFallbackRoom(msg.roomId);
    if (current) {
      const updated: GameRoom = {
        ...current,
        currentRound: msg.nextRound,
        currentQuestion: msg.nextQuestion || current.questions?.[msg.nextRound - 1],
        status: msg.nextRound > (current.totalRounds || 5) ? 'finished' : 'playing',
        roundStartTime: msg.timestamp,
        roundStartedAt: msg.timestamp,
        hostAnswer: null,
        hostAnswerTime: null,
        guestAnswer: null,
        guestAnswerTime: null,
      };
      saveFallbackRoom(updated, false);
      notifyRoomListeners(updated);
    }
  } else if (msg.type === 'CHAT_MSG') {
    notifyChatListeners(msg.roomId, msg.message);
  }
}

// Attach cross-tab listeners
if (typeof window !== 'undefined') {
  if (broadcastChannel) {
    broadcastChannel.onmessage = (e) => {
      handleIncomingMessage(e.data);
    };
  }
  window.addEventListener('storage', (e) => {
    if (e.key === 'wc_msg_bus' && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (parsed?.msg) handleIncomingMessage(parsed.msg);
      } catch {
        // ignore
      }
    }
  });
}

// Local Storage & Memory Room Persistence
export function saveFallbackRoom(room: GameRoom, broadcast: boolean = true): void {
  if (!room || !room.id) return;
  inMemoryRooms.set(room.id, room);
  if (room.roomCode) {
    inMemoryRooms.set(room.roomCode.toUpperCase(), room);
  }

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`wc_room_${room.id}`, JSON.stringify(room));
      if (room.roomCode) {
        localStorage.setItem(`wc_room_${room.roomCode.toUpperCase()}`, JSON.stringify(room));
      }
    } catch {
      // Non-fatal if storage full
    }
  }

  if (broadcast) {
    broadcastFallbackMessage({ type: 'ROOM_SYNC', room });
  }
}

export function getFallbackRoom(roomIdOrCode: string): GameRoom | null {
  if (!roomIdOrCode) return null;
  const clean = roomIdOrCode.trim().toUpperCase();

  // 1. Check in-memory
  if (inMemoryRooms.has(roomIdOrCode)) return inMemoryRooms.get(roomIdOrCode)!;
  if (inMemoryRooms.has(clean)) return inMemoryRooms.get(clean)!;

  // 2. Check localStorage
  if (typeof window !== 'undefined') {
    try {
      const byId = localStorage.getItem(`wc_room_${roomIdOrCode}`);
      if (byId) return JSON.parse(byId);

      const byCode = localStorage.getItem(`wc_room_${clean}`);
      if (byCode) return JSON.parse(byCode);

      const byPrefixed = localStorage.getItem(`wc_room_room_code_${clean}`);
      if (byPrefixed) return JSON.parse(byPrefixed);

      // Search all keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('wc_room_')) {
          const val = localStorage.getItem(key);
          if (val) {
            const parsed = JSON.parse(val) as GameRoom;
            if (
              parsed.id === roomIdOrCode ||
              parsed.id === `room_code_${clean}` ||
              parsed.roomCode?.toUpperCase() === clean
            ) {
              return parsed;
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}

export function updateFallbackRoom(roomId: string, updates: Partial<GameRoom>): GameRoom | null {
  const current = getFallbackRoom(roomId);
  if (!current) return null;
  const updated: GameRoom = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  saveFallbackRoom(updated, true);
  notifyRoomListeners(updated);
  return updated;
}

export function deleteFallbackRoom(roomId: string): void {
  inMemoryRooms.delete(roomId);
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(`wc_room_${roomId}`);
    } catch {
      // ignore
    }
  }
}

// Subscribe to game room updates across tabs / WebRTC
export function subscribeToFallbackRoom(
  roomId: string,
  onUpdate: (room: GameRoom) => void,
  onMessage?: (msg: ChatMessage) => void
): () => void {
  if (!roomListeners.has(roomId)) {
    roomListeners.set(roomId, new Set());
  }
  roomListeners.get(roomId)!.add(onUpdate);

  if (onMessage) {
    if (!chatListeners.has(roomId)) {
      chatListeners.set(roomId, new Set());
    }
    chatListeners.get(roomId)!.add(onMessage);
  }

  // Initial read
  const current = getFallbackRoom(roomId);
  if (current) onUpdate(current);

  // Active polling fallback for stale tab catches
  const pollTimer = setInterval(() => {
    const fresh = getFallbackRoom(roomId);
    if (fresh) onUpdate(fresh);
  }, 450);

  return () => {
    clearInterval(pollTimer);
    roomListeners.get(roomId)?.delete(onUpdate);
    if (onMessage) chatListeners.get(roomId)?.delete(onMessage);
  };
}

// -------------------------------------------------------------
// WebRTC Direct Peer Synchronization (Worldwide Cross-Device)
// -------------------------------------------------------------
const PEERJS_PREFIX = 'wc-mapia-v2-';

export function initHostPeer(
  roomCode: string,
  initialRoom: GameRoom,
  onGuestJoined: (updatedRoom: GameRoom, startTime: number) => void
): () => void {
  const cleanCode = roomCode.trim().toLowerCase();
  const peerId = `${PEERJS_PREFIX}${cleanCode}`;

  try {
    if (activeHostPeer) {
      activeHostPeer.destroy();
      activeHostPeer = null;
    }

    const peer = new Peer(peerId, {
      debug: 0,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' },
        ],
      },
    });
    activeHostPeer = peer;

    peer.on('connection', (conn) => {
      activePeerConnections.set(initialRoom.id, conn);
      activePeerConnections.set(`room_code_${roomCode.toUpperCase()}`, conn);
      activePeerConnections.set(roomCode.toUpperCase(), conn);

      conn.on('data', (raw: unknown) => {
        const data = raw as FallbackMessage;
        if (data?.type === 'GUEST_JOIN') {
          const startTime = Date.now() + 3200;
          const current = getFallbackRoom(initialRoom.id) || initialRoom;
          const updated: GameRoom = {
            ...current,
            guestId: data.guest.uid || `guest_${data.guestSessionId}`,
            guestSessionId: data.guestSessionId,
            guestUsername: data.guest.username || 'Challenger',
            guestCountryCode: data.guest.countryCode || 'UN',
            guestCountryFlag: data.guest.countryFlag || '🌍',
            guestAvatar: data.guest.avatar || current.guestAvatar,
            guestScore: 0,
            guestReady: true,
            hostReady: true,
            status: 'ready',
            roundStartedAt: startTime,
            roundStartTime: startTime,
            updatedAt: new Date().toISOString(),
          };

          saveFallbackRoom(updated, true);

          // 1. Reply with MATCH_READY and ROOM_SYNC
          const readyMsg: FallbackMessage = {
            type: 'MATCH_READY',
            roomId: initialRoom.id,
            room: updated,
            startTime,
            hostSessionId: initialRoom.hostSessionId || getClientSessionId(),
          };
          conn.send(readyMsg);
          conn.send({ type: 'ROOM_SYNC', room: updated });
          broadcastFallbackMessage(readyMsg);

          // 2. Strict two-way handshake: Wait for guest MATCH_ACK with 500ms safety timeout
          let acked = false;
          const completeMatch = () => {
            if (acked) return;
            acked = true;
            onGuestJoined(updated, startTime);
          };

          const safetyTimer = setTimeout(completeMatch, 500);

          conn.on('data', (innerRaw: unknown) => {
            const inner = innerRaw as FallbackMessage;
            if (inner?.type === 'MATCH_ACK' || inner?.type === 'GAME_START_CONFIRMED') {
              clearTimeout(safetyTimer);
              completeMatch();
            }
          });
        } else if (data) {
          handleIncomingMessage(data);
        }
      });
    });

    peer.on('error', (err) => {
      console.warn('Host WebRTC peer notice (continuing with local/storage fallback):', err?.type);
    });

    return () => {
      try {
        peer.destroy();
      } catch {
        // ignore
      }
      activeHostPeer = null;
    };
  } catch (err) {
    console.warn('PeerJS initHostPeer notice:', err);
    return () => {};
  }
}

export async function joinGuestPeer(
  roomCode: string,
  guestUser: Partial<UserProfile>
): Promise<{ room: GameRoom; startTime: number } | null> {
  const cleanCode = roomCode.trim().toLowerCase();
  const targetPeerId = `${PEERJS_PREFIX}${cleanCode}`;
  const mySessionId = getClientSessionId();

  return new Promise((resolve) => {
    let resolved = false;

    // Timeout after 2.5s and fallback to LocalStorage/BroadcastChannel
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        const local = getFallbackRoom(roomCode);
        if (local) {
          const startTime = local.roundStartTime || Date.now() + 3200;
          resolve({ room: local, startTime });
        } else {
          resolve(null);
        }
      }
    }, 2500);

    try {
      if (activeGuestPeer) {
        activeGuestPeer.destroy();
        activeGuestPeer = null;
      }

      const peer = new Peer({
        debug: 0,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        },
      });
      activeGuestPeer = peer;

      peer.on('open', () => {
        const conn = peer.connect(targetPeerId, { reliable: true });

        conn.on('open', () => {
          activePeerConnections.set(`room_code_${roomCode.toUpperCase()}`, conn);
          activePeerConnections.set(roomCode.toUpperCase(), conn);

          // Step 1: Send GUEST_JOIN request
          conn.send({
            type: 'GUEST_JOIN',
            roomId: `room_code_${roomCode.toUpperCase()}`,
            guest: guestUser,
            guestSessionId: mySessionId,
          });
        });

        conn.on('data', (raw: unknown) => {
          const data = raw as FallbackMessage;
          if (
            (data?.type === 'MATCH_READY' || data?.type === 'GAME_START' || data?.type === 'ROOM_SYNC') &&
            'room' in data &&
            data.room
          ) {
            const receivedRoom = data.room;
            const startTime =
              ('startTime' in data && typeof data.startTime === 'number' && data.startTime > 0)
                ? data.startTime
                : receivedRoom.roundStartTime || Date.now() + 3200;

            // Step 2: Respond with MATCH_ACK & GAME_START_CONFIRMED to complete handshake
            const ackMsg: FallbackMessage = {
              type: 'MATCH_ACK',
              roomId: receivedRoom.id,
              guestSessionId: mySessionId,
              timestamp: Date.now(),
            };
            try {
              conn.send(ackMsg);
            } catch {
              // ignore
            }
            broadcastFallbackMessage(ackMsg);

            saveFallbackRoom(receivedRoom, true);
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              resolve({ room: receivedRoom, startTime });
            }
          }
        });

        conn.on('error', () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            const local = getFallbackRoom(roomCode);
            resolve(local ? { room: local, startTime: local.roundStartTime || Date.now() + 3200 } : null);
          }
        });
      });

      peer.on('error', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          const local = getFallbackRoom(roomCode);
          resolve(local ? { room: local, startTime: local.roundStartTime || Date.now() + 3200 } : null);
        }
      });
    } catch {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        const local = getFallbackRoom(roomCode);
        resolve(local ? { room: local, startTime: local.roundStartTime || Date.now() + 3200 } : null);
      }
    }
  });
}

// -------------------------------------------------------------
// Fallback Random Matchmaking Queue
// -------------------------------------------------------------
export async function joinFallbackQueue(
  user: UserProfile,
  preferredCategory: GameCategory | 'mixed',
  targetCountryCode?: string
): Promise<{ roomId: string; matchedRoom?: GameRoom }> {
  const mySessionId = getClientSessionId();
  const queueKeyPrefix = 'wc_queue_';

  // 1. Scan for open waiting rooms in local storage
  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(queueKeyPrefix)) {
          const item = localStorage.getItem(key);
          if (item) {
            const waitingRoom = JSON.parse(item) as GameRoom;
            const isRecent = Date.now() - new Date(waitingRoom.createdAt).getTime() < 45000;
            const isDifferentSession = waitingRoom.hostSessionId !== mySessionId;
            const isStillWaiting = waitingRoom.status === 'waiting' && !waitingRoom.guestId;

            if (isRecent && isDifferentSession && isStillWaiting) {
              // Pair with this waiting room!
              const now = Date.now();
              const matchedRoom: GameRoom = {
                ...waitingRoom,
                guestId: user.uid || `guest_${mySessionId}`,
                guestSessionId: mySessionId,
                guestUsername: user.username || 'Challenger',
                guestCountryCode: user.countryCode || 'TN',
                guestCountryFlag: user.countryFlag || '🌍',
                guestAvatar: user.avatar || '',
                guestScore: 0,
                guestReady: true,
                status: 'starting',
                roundStartedAt: now,
                roundStartTime: now,
                updatedAt: new Date().toISOString(),
              };

              // Update storage and remove from queue
              saveFallbackRoom(matchedRoom, true);
              localStorage.removeItem(key);

              return { roomId: matchedRoom.id, matchedRoom };
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // 2. No open waiting player found -> Create our own waiting room!
  const questions = await fetchDynamicGameQuestions({
    category: preferredCategory,
    countryCode: targetCountryCode,
    count: preferredCategory === 'guess_number' ? 3 : 5,
    userLevel: user.level,
  });

  const roomId = `room_fb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const waitingRoom: GameRoom = {
    id: roomId,
    roomCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
    hostId: user.uid || `host_${mySessionId}`,
    hostSessionId: mySessionId,
    hostUsername: user.username || 'Explorer',
    hostCountryCode: user.countryCode || 'TN',
    hostCountryFlag: user.countryFlag || '🇹🇳',
    hostAvatar: user.avatar || '',
    hostScore: 0,
    hostReady: true,
    guestId: '',
    guestSessionId: '',
    guestUsername: '',
    guestCountryCode: '',
    guestCountryFlag: '',
    guestAvatar: '',
    guestScore: 0,
    guestReady: false,
    gameMode: preferredCategory,
    status: 'waiting',
    currentRound: 1,
    totalRounds: questions.length,
    questionIds: questions.map((q) => q.id),
    questions,
    currentQuestion: questions[0],
    roundStartedAt: 0,
    roundStartTime: 0,
    isBotOpponent: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveFallbackRoom(waitingRoom, false);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`${queueKeyPrefix}${roomId}`, JSON.stringify(waitingRoom));
    } catch {
      // ignore
    }
  }

  broadcastFallbackMessage({
    type: 'QUEUE_ANNOUNCE',
    room: waitingRoom,
    sessionId: mySessionId,
  });

  return { roomId };
}

export function leaveFallbackQueue(roomId: string): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(`wc_queue_${roomId}`);
      deleteFallbackRoom(roomId);
    } catch {
      // ignore
    }
  }
}

// -------------------------------------------------------------
// Worldwide WebRTC Queue Lobby (Instant cross-device pairing)
// -------------------------------------------------------------
const QUEUE_LOBBY_PREFIX = 'cw-queue-lobby-';
let activeQueueLobbyPeer: Peer | null = null;

export function initQueueLobbyPeer(
  category: string,
  user: UserProfile,
  onOpponentFound: (matchedRoom: GameRoom, startTime: number) => void
): () => void {
  const normCategory = category.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'quiz';
  const targetLobbyId = `${QUEUE_LOBBY_PREFIX}${normCategory}`;
  const mySessionId = getClientSessionId();

  let isDestroyed = false;

  try {
    if (activeQueueLobbyPeer) {
      activeQueueLobbyPeer.destroy();
      activeQueueLobbyPeer = null;
    }

    // Try becoming host of this queue slot or connecting to it if it exists
    const hostPeer = new Peer(targetLobbyId, {
      debug: 0,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      },
    });
    activeQueueLobbyPeer = hostPeer;

    // If successfully bound to targetLobbyId, we are waiting as host!
    hostPeer.on('connection', (conn) => {
      conn.on('data', async (raw: unknown) => {
        const data = raw as FallbackMessage;
        if (data?.type === 'GUEST_JOIN' && !isDestroyed) {
          isDestroyed = true;
          const questions = await fetchDynamicGameQuestions({
            category: category as GameCategory,
            count: category === 'guess_number' ? 3 : 5,
            userLevel: user.level,
          });
          const startTime = Date.now() + 3200;
          const roomId = `room_p2p_${Date.now()}`;
          const room: GameRoom = {
            id: roomId,
            roomCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
            hostId: user.uid || `host_${mySessionId}`,
            hostSessionId: mySessionId,
            hostUsername: user.username || 'Explorer',
            hostCountryCode: user.countryCode || 'TN',
            hostCountryFlag: user.countryFlag || '🇹🇳',
            hostAvatar: user.avatar || '',
            hostScore: 0,
            hostReady: true,
            guestId: data.guest.uid || `guest_${data.guestSessionId}`,
            guestSessionId: data.guestSessionId,
            guestUsername: data.guest.username || 'Challenger',
            guestCountryCode: data.guest.countryCode || 'UN',
            guestCountryFlag: data.guest.countryFlag || '🌍',
            guestAvatar: data.guest.avatar || '',
            guestScore: 0,
            guestReady: true,
            gameMode: category as GameCategory,
            status: 'ready',
            currentRound: 1,
            totalRounds: questions.length,
            questionIds: questions.map((q) => q.id),
            questions,
            currentQuestion: questions[0],
            roundStartedAt: startTime,
            roundStartTime: startTime,
            isBotOpponent: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          saveFallbackRoom(room, true);
          activePeerConnections.set(roomId, conn);

          // Step 1: Send GAME_START direct sync event to Device B
          const startMsg: FallbackMessage = {
            type: 'GAME_START',
            roomId,
            room,
            startTime,
          };
          try {
            conn.send(startMsg);
            conn.send({ type: 'ROOM_SYNC', room });
          } catch {
            // ignore
          }
          broadcastFallbackMessage(startMsg);

          // Step 2: Wait for Device B to respond with GAME_START_CONFIRMED
          let acked = false;
          const launchMatch = () => {
            if (acked) return;
            acked = true;
            onOpponentFound(room, startTime);
          };

          const safetyTimer = setTimeout(launchMatch, 500);

          conn.on('data', (innerRaw: unknown) => {
            const inner = innerRaw as FallbackMessage;
            if (inner?.type === 'GAME_START_CONFIRMED' || inner?.type === 'MATCH_ACK') {
              clearTimeout(safetyTimer);
              launchMatch();
            }
          });
        }
      });
    });

    // If targetLobbyId is already taken, someone else is hosting! We connect as guest!
    hostPeer.on('error', (err) => {
      if (err?.type === 'unavailable-id' && !isDestroyed) {
        const guestPeer = new Peer({
          debug: 0,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
            ],
          },
        });
        activeQueueLobbyPeer = guestPeer;

        guestPeer.on('open', () => {
          const conn = guestPeer.connect(targetLobbyId, { reliable: true });
          conn.on('open', () => {
            conn.send({
              type: 'GUEST_JOIN',
              roomId: '',
              guest: user,
              guestSessionId: mySessionId,
            });
          });

          conn.on('data', (raw: unknown) => {
            const data = raw as FallbackMessage;
            if (
              (data?.type === 'GAME_START' || data?.type === 'MATCH_READY' || data?.type === 'ROOM_SYNC') &&
              'room' in data &&
              data.room &&
              !isDestroyed
            ) {
              isDestroyed = true;
              const matchedRoom = data.room;
              const startTime =
                ('startTime' in data && typeof data.startTime === 'number' && data.startTime > 0)
                  ? data.startTime
                  : matchedRoom.roundStartTime || Date.now() + 3200;

              // Step 2: Device B responds with GAME_START_CONFIRMED
              const confirmMsg: FallbackMessage = {
                type: 'GAME_START_CONFIRMED',
                roomId: matchedRoom.id,
                guestSessionId: mySessionId,
                timestamp: Date.now(),
              };
              try {
                conn.send(confirmMsg);
              } catch {
                // ignore
              }
              broadcastFallbackMessage(confirmMsg);

              saveFallbackRoom(matchedRoom, true);
              activePeerConnections.set(matchedRoom.id, conn);
              onOpponentFound(matchedRoom, startTime);
            }
          });
        });
      }
    });

    return () => {
      isDestroyed = true;
      try {
        if (activeQueueLobbyPeer) {
          activeQueueLobbyPeer.destroy();
          activeQueueLobbyPeer = null;
        }
      } catch {
        // ignore
      }
    };
  } catch (err) {
    console.warn('Queue lobby peer notice:', err);
    return () => {};
  }
}
