
export const EDGE_VOICES = [
  { name: 'vi-VN-HoaiMyNeural', friendlyName: 'Microsoft Hoài My (Nữ)' },
  { name: 'vi-VN-NamMinhNeural', friendlyName: 'Microsoft Nam Minh (Nam)' }
];

function createSSML(text: string, voiceName: string, rate: number = 1.0) {
    // Edge TTS supports prosody rate. +0% is 1.0. 
    // rate 1.5 -> +50%. rate 0.8 -> -20%.
    const percentage = Math.round((rate - 1) * 100);
    const rateStr = percentage >= 0 ? `+${percentage}%` : `${percentage}%`;
    
    return `
    <speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='vi-VN'>
        <voice name='${voiceName}'>
            <prosody rate='${rateStr}'>${text}</prosody>
        </voice>
    </speak>
    `.trim();
}

function getCurrentTime() {
    // Simple timestamp for X-Timestamp header
    return new Date().toString(); 
}

// Simple UUID generator if uuid package not available, but user might have to install 'uuid' or I can use crypto.
function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID().replace(/-/g, '');
    }
    return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export class EdgeSpeechService {
    // Use a simple callback system for the UI
    // Getting an audio blob URL is easier for the HTMLAudioElement
    
    async synthesize(text: string, voice: string, rate: number): Promise<{ audioBlob: Blob, wordBoundaries: any[] }> {
        return new Promise((resolve, reject) => {
            const requestId = generateUUID();
            // Updated endpoint with proper format (as of 2024+)
            const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${requestId}`;
            
            let ws: WebSocket;
            try {
                ws = new WebSocket(wsUrl);
            } catch (e) {
                reject(new Error('WebSocket không khả dụng. Hãy chuyển về chế độ Trình duyệt.'));
                return;
            }
            
            const audioChunks: BlobPart[] = [];
            const wordBoundaries: any[] = [];
            
            let wsOpenTimeout: ReturnType<typeof setTimeout>;
            
            ws.onopen = () => {
                clearTimeout(wsOpenTimeout);
                try {
                    const configMsg = {
                        context: {
                            synthesis: {
                                audio: {
                                    metadataOptions: {
                                        sentenceBoundaryEnabled: false,
                                        wordBoundaryEnabled: true
                                    },
                                    outputFormat: "audio-24khz-48kbitrate-mono-mp3"
                                }
                            }
                        }
                    };
                    
                    const timestamp = getCurrentTime();
                    ws.send(`X-Timestamp:${timestamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify(configMsg)}`);
                    
                    const ssml = createSSML(text, voice, rate);
                    ws.send(`X-Timestamp:${timestamp}\r\nX-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`);
                } catch (e) {
                    reject(e);
                }
            };

            wsOpenTimeout = setTimeout(() => {
                if (ws.readyState !== WebSocket.OPEN) {
                    ws.close();
                    reject(new Error('Edge TTS timeout. Endpoint có thể bị chặn - hãy dùng chế độ Trình duyệt.'));
                }
            }, 10000);

            ws.onmessage = async (event) => {
                const data = event.data;
                
                if (typeof data === 'string') {
                    // Text metadata
                    if (data.includes('Path:audio.metadata')) {
                        // Extract JSON payload
                        const separator = '\r\n\r\n';
                        const jsonIndex = data.indexOf(separator);
                        if (jsonIndex !== -1) {
                            const jsonStr = data.substring(jsonIndex + separator.length);
                            try {
                                const metadata = JSON.parse(jsonStr);
                                if (metadata.Metadata && metadata.Metadata.length > 0) {
                                     // Metadata format: { Type: "WordBoundary", Data: { Offset: ..., Duration: ..., text: { Text: ..., Length: ..., BoundaryType: ... } } }
                                     // Actually Edge TTS metadata is slightly different often.
                                     // Let's inspect typical structure or assume it matches.
                                     // Edge TTS usually sends `Metadata` array.
                                     metadata.Metadata.forEach((m: any) => {
                                         if (m.Type === 'WordBoundary') {
                                             wordBoundaries.push(m.Data);
                                         }
                                     });
                                }
                            } catch (e) { console.error("Parse metadata error", e); }
                        }
                    } else if (data.includes('Path:turn.end')) {
                        ws.close();
                    }
                } else if (data instanceof Blob || data instanceof ArrayBuffer) {
                    // Binary audio
                    // The binary message also has headers. We need to skip them.
                    // Usually header length is 2 bytes (big endian) at start of buffer? 
                    // No, implementation differs. 
                    
                    // For Edge TTS over websocket, binary messages have a 2-byte header length, then headers, then audio.
                    // Let's safe-parse.
                    let buffer: ArrayBuffer;
                    if (data instanceof Blob) {
                        buffer = await data.arrayBuffer();
                    } else {
                        buffer = data;
                    }
                    
                    const view = new DataView(buffer);
                    const headerLength = view.getUint16(0); // big-endian
                    // Skip headerLength + 2 bytes
                    if (buffer.byteLength > headerLength + 2) {
                        const audioPart = buffer.slice(headerLength + 2);
                        audioChunks.push(audioPart);
                    }
                }
            };

            ws.onerror = () => {
                clearTimeout(wsOpenTimeout);
                reject(new Error('Lỗi Edge TTS: Endpoint bị chặn hoặc mạng lỗi. Hãy chuyển về chế độ Trình duyệt.'));
            };

            ws.onclose = (event) => {
                clearTimeout(wsOpenTimeout);
                if (audioChunks.length === 0 && event.code !== 1000) {
                    reject(new Error(`Edge TTS đóng sớm (code ${event.code}). Endpoint có thể bị chặn - hãy dùng Trình duyệt.`));
                } else {
                    const blob = new Blob(audioChunks, { type: 'audio/mp3' });
                    resolve({ audioBlob: blob, wordBoundaries });
                }
            };
        });
    }
}
