import {
  Bot,
  LoaderCircle,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Sparkles,
  Volume2,
  Waves,
  WandSparkles
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { api } from '../lib/api';
import type { Difficulty, PracticeType } from '../types';

type RealtimePracticeRoomProps = {
  practiceType: PracticeType;
  difficulty: Difficulty;
  topic: string;
};

type VoiceMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
};

type RealtimeTokenResponse = {
  session: {
    value: string;
    expiresAt: number;
    model: string;
    voice: string;
  };
};

const practiceLabels: Record<PracticeType, string> = {
  presentation: 'Thuyết trình',
  interview: 'Phỏng vấn'
};

const difficultyLabels: Record<Difficulty, string> = {
  easy: 'Dễ',
  medium: 'Trung bình',
  hard: 'Khó'
};

const createMessageId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const getRealtimeError = async (response: Response) => {
  const fallback = 'Không thể kết nối tới phòng hội thoại realtime.';

  try {
    const text = (await response.text()).trim();
    if (!text) {
      return fallback;
    }

    try {
      const parsed = JSON.parse(text) as { error?: { message?: string }; message?: string };
      const message = parsed.error?.message || parsed.message || fallback;
      return normalizeRealtimeUiError(message);
    } catch {
      return normalizeRealtimeUiError(text);
    }
  } catch {
    return fallback;
  }
};

const normalizeRealtimeUiError = (message: string) => {
  const normalized = message.toLowerCase();

  if (normalized.includes('insufficient_quota') || normalized.includes('you exceeded your current quota')) {
    return 'Tài khoản OpenAI API của bạn đã hết quota hoặc chưa bật thanh toán. Hãy nạp credit hoặc kích hoạt Billing trên platform.openai.com rồi thử lại.';
  }

  if (normalized.includes('invalid_api_key') || normalized.includes('incorrect api key provided')) {
    return 'OPENAI_API_KEY hiện không hợp lệ. Hãy tạo key mới trên platform.openai.com/api-keys rồi cập nhật lại.';
  }

  if (normalized.includes('rate limit')) {
    return 'OpenAI API đang tạm chặn do quá nhiều yêu cầu trong thời gian ngắn. Hãy đợi một chút rồi mở lại phòng.';
  }

  return message;
};

export function RealtimePracticeRoom({ practiceType, difficulty, topic }: RealtimePracticeRoomProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const assistantDraftRef = useRef('');

  const [status, setStatus] = useState<'idle' | 'connecting' | 'ready' | 'error'>('idle');
  const [phase, setPhase] = useState('Chưa mở phòng hội thoại');
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [assistantDraft, setAssistantDraft] = useState('');
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<RealtimeTokenResponse['session'] | null>(null);

  const browserSupported =
    typeof window !== 'undefined' &&
    typeof window.RTCPeerConnection !== 'undefined' &&
    Boolean(window.navigator.mediaDevices?.getUserMedia);

  const appendMessage = (role: VoiceMessage['role'], text: string) => {
    const normalized = text.trim();
    if (!normalized) {
      return;
    }

    setMessages((current) => {
      const lastMessage = current[current.length - 1];
      if (lastMessage && lastMessage.role === role && lastMessage.text === normalized) {
        return current;
      }

      return [...current.slice(-9), { id: createMessageId(), role, text: normalized }];
    });
  };

  const destroyRoomResources = () => {
    try {
      if (dataChannelRef.current?.readyState === 'open') {
        dataChannelRef.current.send(JSON.stringify({ type: 'response.cancel' }));
      }
    } catch {
      // Bỏ qua lỗi đóng kênh dữ liệu.
    }

    dataChannelRef.current?.close();
    dataChannelRef.current = null;

    peerConnectionRef.current?.getSenders().forEach((sender) => sender.track?.stop());
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
    }

    assistantDraftRef.current = '';
  };

  const teardownRoom = (nextStatus: 'idle' | 'error', nextPhase: string) => {
    destroyRoomResources();
    setAssistantDraft('');
    setUserSpeaking(false);
    setAssistantSpeaking(false);
    setIsMuted(false);
    setStatus(nextStatus);
    setPhase(nextPhase);
  };

  useEffect(
    () => () => {
      destroyRoomResources();
    },
    []
  );

  const sendRoomEvent = (payload: Record<string, unknown>) => {
    if (dataChannelRef.current?.readyState !== 'open') {
      return;
    }

    dataChannelRef.current.send(JSON.stringify(payload));
  };

  const askAiToOpen = () => {
    sendRoomEvent({
      type: 'response.create',
      response: {
        instructions: `Hãy mở lời thật ngắn gọn bằng tiếng Việt, giới thiệu đây là phiên ${practiceLabels[practiceType].toLowerCase()} và mời người dùng bắt đầu với chủ đề: ${topic}.`,
      }
    });
  };

  const askAiNextTurn = () => {
    sendRoomEvent({
      type: 'response.create',
      response: {
        instructions: `Tiếp tục phiên ${practiceLabels[practiceType].toLowerCase()} ở mức ${difficultyLabels[difficulty].toLowerCase()}. Hãy đặt một câu hỏi tiếp theo thật ngắn, bám sát chủ đề: ${topic}.`,
      }
    });
  };

  const startRoom = async () => {
    if (!browserSupported) {
      setError('Trình duyệt hiện tại chưa hỗ trợ WebRTC hoặc chưa cho phép dùng micro.');
      return;
    }

    if (!topic.trim()) {
      setError('Hãy nhập chủ đề trước khi mở phòng hội thoại.');
      return;
    }

    teardownRoom('idle', 'Đang làm mới phiên cũ');
    setMessages([]);
    setSessionInfo(null);
    setError('');
    setStatus('connecting');
    setPhase('Đang mở phòng hội thoại');

    try {
      const tokenResponse = await api.post<RealtimeTokenResponse>('/ai/realtime/token', {
        practiceType,
        difficulty,
        topic
      });
      const nextSession = tokenResponse.data.session;
      setSessionInfo(nextSession);

      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = localStream;

      const peerConnection = new RTCPeerConnection();
      peerConnectionRef.current = peerConnection;

      localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
      });

      peerConnection.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (audioRef.current && remoteStream) {
          audioRef.current.srcObject = remoteStream;
          audioRef.current.play().catch(() => undefined);
        }
      };

      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'connected') {
          setStatus('ready');
          setPhase('SpeakAI đang lắng nghe');
          return;
        }

        if (peerConnection.connectionState === 'failed') {
          setError('Kết nối giọng nói bị gián đoạn. Hãy mở lại phòng.');
          teardownRoom('error', 'Không thể duy trì kết nối');
          return;
        }

        if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'closed') {
          setPhase('Phiên hội thoại đã ngắt');
        }
      };

      const channel = peerConnection.createDataChannel('oai-events');
      dataChannelRef.current = channel;

      channel.addEventListener('open', () => {
        setStatus('ready');
        setPhase('SpeakAI đã vào phòng');
        askAiToOpen();
      });

      channel.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(event.data) as {
            type?: string;
            delta?: string;
            text?: string;
            transcript?: string;
            error?: { message?: string };
          };

          switch (payload.type) {
            case 'input_audio_buffer.speech_started':
              setUserSpeaking(true);
              setAssistantSpeaking(false);
              setPhase('Bạn đang nói');
              break;
            case 'input_audio_buffer.speech_stopped':
              setUserSpeaking(false);
              setPhase('SpeakAI đang phản hồi');
              break;
            case 'conversation.item.input_audio_transcription.completed':
              appendMessage('user', payload.transcript ?? payload.text ?? '');
              break;
            case 'response.created':
              assistantDraftRef.current = '';
              setAssistantDraft('');
              setAssistantSpeaking(true);
              setPhase('SpeakAI đang trả lời');
              break;
            case 'response.output_audio.delta':
            case 'response.audio.delta':
              setAssistantSpeaking(true);
              break;
            case 'response.output_audio.done':
            case 'response.audio.done':
              setAssistantSpeaking(false);
              break;
            case 'response.output_audio_transcript.delta':
            case 'response.audio_transcript.delta':
              assistantDraftRef.current += payload.delta ?? '';
              setAssistantDraft(assistantDraftRef.current);
              break;
            case 'response.output_audio_transcript.done':
            case 'response.audio_transcript.done':
              appendMessage('assistant', payload.transcript ?? assistantDraftRef.current);
              assistantDraftRef.current = '';
              setAssistantDraft('');
              setAssistantSpeaking(false);
              setPhase('Sẵn sàng cho lượt tiếp theo');
              break;
            case 'response.output_text.done':
              appendMessage('assistant', payload.text ?? '');
              setAssistantSpeaking(false);
              setPhase('Sẵn sàng cho lượt tiếp theo');
              break;
            case 'response.done':
              setAssistantSpeaking(false);
              if (!userSpeaking) {
                setPhase('Sẵn sàng cho lượt tiếp theo');
              }
              break;
            case 'error':
              setError(payload.error?.message ?? 'Phiên hội thoại realtime gặp lỗi.');
              setStatus('error');
              setPhase('Phiên đang gặp lỗi');
              break;
            default:
              break;
          }
        } catch {
          // Bỏ qua sự kiện ngoài phạm vi dùng cho UI.
        }
      });

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${nextSession.value}`,
          'Content-Type': 'application/sdp'
        },
        body: offer.sdp ?? ''
      });

      if (!sdpResponse.ok) {
        throw new Error(await getRealtimeError(sdpResponse));
      }

      const answer = {
        type: 'answer' as const,
        sdp: await sdpResponse.text()
      };

      await peerConnection.setRemoteDescription(answer);
    } catch (roomError: any) {
      const nextMessage = roomError instanceof Error ? roomError.message : 'Không thể mở phòng hội thoại.';
      setError(nextMessage);
      teardownRoom('error', 'Không thể mở phòng hội thoại');
    }
  };

  const stopRoom = () => {
    setError('');
    teardownRoom('idle', 'Đã kết thúc phiên hội thoại');
  };

  const toggleMute = () => {
    if (!localStreamRef.current) {
      return;
    }

    const nextMuted = !isMuted;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  };

  const statusLabel =
    status === 'ready' ? 'Đang trực tuyến' : status === 'connecting' ? 'Đang kết nối' : status === 'error' ? 'Đang lỗi' : 'Chưa mở phòng';

  const signalBars = Array.from({ length: 20 }, (_, index) => {
    const base = 26 + (index % 5) * 11;
    if (assistantSpeaking) {
      return base + 24;
    }
    if (userSpeaking) {
      return base + 16;
    }
    if (status === 'ready') {
      return base + 6;
    }
    return base;
  });

  const expiresLabel = sessionInfo?.expiresAt
    ? new Date(sessionInfo.expiresAt * 1000).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit'
      })
    : '--:--';

  return (
    <section className="panel-card realtime-room-card">
      <div className="realtime-room-header">
        <div>
          <p className="eyebrow">Phòng hội thoại trực tiếp</p>
          <h3>Trò chuyện với SpeakAI bằng giọng nói</h3>
        </div>
        <span className={`realtime-state-pill ${status}`}>
          <Radio size={14} />
          {statusLabel}
        </span>
      </div>

      <div className="realtime-room-stage">
        <div className="realtime-room-core">
          <div className={`realtime-orb ${assistantSpeaking ? 'assistant-active' : ''} ${userSpeaking ? 'user-active' : ''} ${status === 'ready' ? 'connected' : ''}`}>
            <span className="realtime-orb-ring" />
            <span className="realtime-orb-center">SA</span>
          </div>

          <div className={`realtime-signal-bars ${status === 'ready' ? 'active' : ''} ${assistantSpeaking ? 'assistant' : userSpeaking ? 'user' : ''}`}>
            {signalBars.map((height, index) => (
              <span key={`${height}-${index}`} style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>

        <div className="realtime-room-console">
          <div className="realtime-phase-card">
            <strong>{phase}</strong>
            <p>{topic}</p>
          </div>

          <div className="realtime-status-grid">
            <article className="realtime-status-card">
              <span>Chế độ</span>
              <strong>{practiceLabels[practiceType]}</strong>
            </article>
            <article className="realtime-status-card">
              <span>Độ khó</span>
              <strong>{difficultyLabels[difficulty]}</strong>
            </article>
            <article className="realtime-status-card">
              <span>Giọng</span>
              <strong>{sessionInfo?.voice ?? 'Marin'}</strong>
            </article>
            <article className="realtime-status-card">
              <span>Mô hình</span>
              <strong>{sessionInfo?.model ?? 'Realtime'}</strong>
            </article>
            <article className="realtime-status-card">
              <span>Hết hạn khóa phiên</span>
              <strong>{expiresLabel}</strong>
            </article>
            <article className="realtime-status-card">
              <span>Micro</span>
              <strong>{isMuted ? 'Đang tắt' : status === 'ready' ? 'Đang mở' : 'Chưa mở'}</strong>
            </article>
          </div>

          <div className="realtime-toolbar">
            <button type="button" className="primary-button" onClick={startRoom} disabled={status === 'connecting'}>
              {status === 'connecting' ? <LoaderCircle size={18} className="spin" /> : <Sparkles size={18} />}
              {status === 'ready' ? 'Mở lại phòng' : 'Mở phòng hội thoại'}
            </button>
            <button type="button" className="ghost-button" onClick={toggleMute} disabled={status !== 'ready'}>
              {isMuted ? <Mic size={16} /> : <MicOff size={16} />}
              {isMuted ? 'Bật micro' : 'Tắt micro'}
            </button>
            <button type="button" className="ghost-button" onClick={askAiNextTurn} disabled={status !== 'ready'}>
              <WandSparkles size={16} />
              Gợi ý lượt kế tiếp
            </button>
            <button type="button" className="ghost-button" onClick={stopRoom} disabled={status === 'idle' && !messages.length}>
              <PhoneOff size={16} />
              Kết thúc
            </button>
          </div>

          <div className="realtime-capability-row">
            <span className="badge-soft">
              <Bot size={14} />
              AI giữ hội thoại theo ngữ cảnh
            </span>
            <span className="badge-soft">
              <Waves size={14} />
              Trả lời lại bằng giọng nói
            </span>
            <span className="badge-soft">
              <Volume2 size={14} />
              Transcript xuất hiện theo phiên
            </span>
          </div>
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="realtime-log-shell">
        <div className="realtime-log-head">
          <div>
            <p className="eyebrow">Dòng hội thoại</p>
            <h4>Transcript thời gian thực</h4>
          </div>
          <span className="badge-soft">
            {messages.length + (assistantDraft ? 1 : 0)} lượt hiển thị
          </span>
        </div>

        <div className="realtime-message-log">
          {!messages.length && !assistantDraft ? (
            <div className="realtime-empty-state">
              <p>Mở phòng và bắt đầu nói. SpeakAI sẽ phản hồi lại bằng giọng nói ngay trong phiên.</p>
            </div>
          ) : null}

          {messages.map((message) => (
            <article key={message.id} className={`realtime-message ${message.role}`}>
              <span>{message.role === 'assistant' ? 'SpeakAI' : 'Bạn'}</span>
              <strong>{message.text}</strong>
            </article>
          ))}

          {assistantDraft ? (
            <article className="realtime-message assistant draft">
              <span>SpeakAI</span>
              <strong>{assistantDraft}</strong>
            </article>
          ) : null}
        </div>
      </div>

      {!browserSupported ? <p className="error-text">Thiết bị hiện tại chưa hỗ trợ WebRTC hoặc quyền micro cho phòng hội thoại.</p> : null}

      <audio ref={audioRef} autoPlay playsInline className="realtime-hidden-audio" />
    </section>
  );
}
