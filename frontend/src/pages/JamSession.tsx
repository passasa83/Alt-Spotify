import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useJamStore } from '@/stores/jamStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useAuthStore } from '@/stores/authStore';
import { getTrackStreamUrl } from '@/api/tracks';
import {
  Users,
  Music,
  SkipForward,
  MessageSquare,
  LogOut,
  Copy,
  Check,
} from 'lucide-react';

const JamSession = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    currentSession,
    messages,
    participants,
    isConnected,
    loadSession,
    joinSession,
    leaveSession,
    sendTrackChange,
    sendVoteSkip,
    sendChat,
    connectWebSocket,
    disconnectWebSocket,
  } = useJamStore();
  const { currentTrack } = usePlayerStore();
  const [chatInput, setChatInput] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (sessionId) {
      loadSession(Number(sessionId)).then(() => {
        connectWebSocket(Number(sessionId));
      });
    }
    return () => {
      disconnectWebSocket();
    };
  }, [sessionId]);

  const handleCreateSession = async () => {
    setIsCreating(true);
    try {
      await useJamStore.getState().createSession();
      const session = useJamStore.getState().currentSession;
      if (session) {
        connectWebSocket(session.id);
        navigate(`/jam/${session.id}`);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinSession = async () => {
    if (joinCode.trim()) {
      try {
        await joinSession(joinCode.trim());
        const session = useJamStore.getState().currentSession;
        if (session) {
          connectWebSocket(session.id);
          navigate(`/jam/${session.id}`);
        }
      } catch (err) {
        console.error('Failed to join session');
      }
    }
  };

  const handleLeaveSession = async () => {
    await leaveSession();
    navigate('/jam');
  };

  const handleSendMessage = () => {
    if (chatInput.trim()) {
      sendChat(chatInput.trim());
      setChatInput('');
    }
  };

  const handleCopyCode = () => {
    if (currentSession?.code) {
      navigator.clipboard.writeText(currentSession.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!currentSession) {
    return (
      <div className="flex flex-col items-center justify-center gap-8 py-16">
        <h1 className="text-3xl font-bold text-white">Jam Session</h1>
        <p className="text-gray-400">Listen together with friends in real-time</p>

        <div className="flex flex-col gap-4 w-full max-w-sm">
          <button
            onClick={handleCreateSession}
            disabled={isCreating}
            className="rounded-full bg-green-500 px-8 py-3 font-bold text-black hover:bg-green-400 disabled:opacity-50"
          >
            {isCreating ? 'Creating...' : 'Create Session'}
          </button>

          <div className="flex items-center gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Enter session code"
              className="flex-1 rounded-full bg-gray-800 px-4 py-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              onClick={handleJoinSession}
              className="rounded-full bg-gray-700 px-6 py-3 font-medium text-white hover:bg-gray-600"
            >
              Join
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-100px)] gap-4">
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex items-center justify-between rounded-lg bg-gray-800 p-4">
          <div>
            <h2 className="text-xl font-bold text-white">Jam Session</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-gray-400">Code:</span>
              <code className="rounded bg-gray-700 px-2 py-1 text-green-400 font-mono">
                {currentSession.code}
              </code>
              <button onClick={handleCopyCode} className="text-gray-400 hover:text-white">
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
            />
            <span className="text-sm text-gray-400">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
            <button
              onClick={handleLeaveSession}
              className="ml-4 rounded-full bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-600"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {currentTrack && (
          <div className="rounded-lg bg-gray-800 p-4">
            <p className="mb-2 text-xs text-gray-400">Now Playing</p>
            <div className="flex items-center gap-4">
              <img
                src={currentTrack.cover_url || '/placeholder-album.png'}
                alt={currentTrack.title}
                className="h-16 w-16 rounded object-cover"
              />
              <div>
                <p className="font-semibold text-white">{currentTrack.title}</p>
                <p className="text-sm text-gray-400">
                  {currentTrack.artist?.name || 'Unknown Artist'}
                </p>
              </div>
              <button
                onClick={() => sendVoteSkip(currentTrack.id)}
                className="ml-auto rounded-full bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-600"
              >
                <SkipForward size={16} />
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto rounded-lg bg-gray-800 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-400">Queue</h3>
          <div className="space-y-2">
            {currentSession.queue.map((track, i) => (
              <div
                key={`${track.id}-${i}`}
                className="flex items-center gap-3 rounded bg-gray-700 p-2"
              >
                <img
                  src={track.cover_url || '/placeholder-album.png'}
                  alt={track.title}
                  className="h-10 w-10 rounded object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">{track.title}</p>
                  <p className="truncate text-xs text-gray-400">
                    {track.artist?.name || 'Unknown'}
                  </p>
                </div>
              </div>
            ))}
            {currentSession.queue.length === 0 && (
              <p className="text-center text-sm text-gray-500">Queue is empty</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex w-80 flex-col gap-4">
        <div className="rounded-lg bg-gray-800 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-400">
            <Users size={16} /> Participants ({participants.length})
          </h3>
          <div className="space-y-2">
            {participants.map((p) => (
              <div key={p.user_id} className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-700">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="h-8 w-8 rounded-full" />
                  ) : (
                    <span className="text-xs text-white">
                      {p.username.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-sm text-white">{p.username}</p>
                  <p className="text-xs text-gray-500">{p.role}</p>
                </div>
                {p.user_id === currentSession.host_id && (
                  <span className="ml-auto rounded bg-green-500/20 px-2 py-0.5 text-xs text-green-400">
                    Host
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col rounded-lg bg-gray-800">
          <div className="flex items-center gap-2 border-b border-gray-700 p-4">
            <MessageSquare size={16} className="text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-400">Chat</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-3">
              {messages
                .filter((m) => m.type === 'chat')
                .map((msg, i) => (
                  <div key={i}>
                    <span className="text-xs text-gray-500">{msg.user_id}</span>
                    <p className="text-sm text-white">{msg.data.message}</p>
                  </div>
                ))}
            </div>
          </div>
          <div className="border-t border-gray-700 p-4">
            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Type a message..."
                className="flex-1 rounded bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none"
              />
              <button
                onClick={handleSendMessage}
                className="rounded bg-green-500 px-3 py-2 text-sm font-medium text-black hover:bg-green-400"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JamSession;
