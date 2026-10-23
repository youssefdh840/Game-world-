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
  | { type: 'PLAYER_ANSWER'; roomId: string; isHost: boolean; answer: string; answerTime: number; scoreDelta: number }
  | { type: 'ADVANCE_ROUND'; roomId: string; nextRound: number; nextQuestion?: Question; timestamp: number }
  | { type: 'CHAT_MSG'; roomId: string; message: ChatMessage }
  | { type: 'QUEUE_ANNOUNCE'; room: GameRoom; sessionId: string };

// Subscribed listeners
type FallbackRoomListener = (room: GameRoom) => void;
type FallbackChatListener = (msg: ChatMessage) => void;
const roomListeners = new Map<string, Set<FallbackRoomListener>>();
const chatListeners = new Map<string, Set<FallbackChatListener>>();

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

// Global broadcast dispatcher (BroadcastChannel + localStorage storage event)
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
  // Send via active WebRTC peer connection if available
  const conn = activePeerConnections.get(msg.roomId);
  if (conn && conn.open) {
    try {
      conn.send(msg);
    } catch {
      // ignore
    }
  }
}

// Receive and handle incoming broadcast/storage messages
function handleIncomingMessage(msg: FallbackMessage) {
  if (!msg || !msg.type) return;

  if (msg.type === 'ROOM_SYNC') {
    saveFallbackRoom(msg.room, false);
    notifyRoomListeners(msg.room);
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
  onGuestJoined: (updatedRoom: GameRoom) => void
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

      conn.on('data', (raw: unknown) => {
        const data = raw as FallbackMessage;
        if (data?.type === 'GUEST_JOIN') {
          const now = Date.now();
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
            status: 'starting',
            roundStartedAt: now,
            roundStartTime: now,
            updatedAt: new Date().toISOString(),
          };

          saveFallbackRoom(updated, true);
          onGuestJoined(updated);

          // Reply with synchronized room data
          conn.send({ type: 'ROOM_SYNC', room: updated });
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
): Promise<GameRoom | null> {
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
        resolve(local);
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

          // Request join
          conn.send({
            type: 'GUEST_JOIN',
            roomId: `room_code_${roomCode.toUpperCase()}`,
            guest: guestUser,
            guestSessionId: mySessionId,
          });
        });

        conn.on('data', (raw: unknown) => {
          const data = raw as FallbackMessage;
          if (data?.type === 'ROOM_SYNC' && data.room) {
            saveFallbackRoom(data.room, true);
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              resolve(data.room);
            }
          }
        });

        conn.on('error', () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve(getFallbackRoom(roomCode));
          }
        });
      });

      peer.on('error', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(getFallbackRoom(roomCode));
        }
      });
    } catch {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(getFallbackRoom(roomCode));
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
