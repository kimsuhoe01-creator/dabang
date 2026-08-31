(() => {
  const API_BASE = ORDER_ENDPOINT.replace(/\/api\/cukcuk\/order$/, "");
  const MAX_SECONDS = 90;
  const copy = {
    ko: { button:"음성 주문", guide:"직원에게 말하듯 메뉴판을 보면서 편하게 말씀해 주세요.", connecting:"음성 주문을 연결하고 있습니다…", listening:"듣는 중 · 취소", listeningGuide:"듣고 있습니다. 메뉴판을 보면서 취소나 변경도 편하게 말씀해 주세요.", finish:"음성 주문 보내기", processing:"말씀하신 주문을 정리하고 있습니다…", retry:"다시 시도", empty:"말씀하신 주문을 듣지 못했습니다.", unavailable:"지금은 음성 주문 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.", timeout:"주문 정리가 오래 걸리고 있습니다. 다시 말씀해 주세요.", failed:"음성 주문을 처리하지 못했습니다. 다시 말씀해 주세요.", cartBusy:"음성 주문은 빈 장바구니에서 시작해 주세요.", mic:"마이크 사용을 허용해 주세요.", mockLabel:"미리보기용 음성 주문", cartTitle:"말씀하신 주문을 확인해 주세요", cartCaption:"주문 내용이 맞으면 아래 주문 전송 버튼을 눌러 주세요.", cartRetry:"다시 말하기", cartSend:"맞아요 · 주문 전송", cartNote:"버튼을 누르면 이 내용 그대로 POS로 전송됩니다. 메뉴·옵션·수량을 확인해 주세요." },
    vi: { button:"Gọi món bằng giọng nói", guide:"Hãy xem thực đơn và nói tự nhiên như đang gọi món với nhân viên.", connecting:"Đang kết nối gọi món bằng giọng nói…", listening:"Đang nghe · Hủy", listeningGuide:"Đang nghe. Hãy xem thực đơn và nói cả món muốn hủy hoặc thay đổi.", finish:"Gửi lời gọi món", processing:"Đang sắp xếp nội dung gọi món…", retry:"Thử lại", empty:"Không nghe được nội dung gọi món.", unavailable:"Hiện không thể kết nối máy chủ gọi món bằng giọng nói. Vui lòng thử lại sau.", timeout:"Việc sắp xếp đơn mất quá nhiều thời gian. Vui lòng nói lại.", failed:"Không thể xử lý đơn giọng nói. Vui lòng nói lại.", cartBusy:"Vui lòng bắt đầu khi giỏ hàng đang trống.", mic:"Vui lòng cho phép sử dụng micrô.", mockLabel:"Câu gọi món để xem thử", cartTitle:"Vui lòng kiểm tra đơn vừa nói", cartCaption:"Nếu nội dung đúng, hãy nhấn nút gửi đơn bên dưới.", cartRetry:"Nói lại", cartSend:"Đúng · Gửi đơn", cartNote:"Khi nhấn nút, nội dung này sẽ được gửi thẳng đến POS. Hãy kiểm tra món, tùy chọn và số lượng." },
    zh: { button:"语音点餐", guide:"请一边查看菜单，一边像对服务员一样自然说出您的订单。", connecting:"正在连接语音点餐…", listening:"正在收听 · 取消", listeningGuide:"正在收听。请查看菜单，也可以自然说出取消或修改内容。", finish:"发送语音订单", processing:"正在整理您说的订单…", retry:"重试", empty:"没有听到订单内容。", unavailable:"目前无法连接语音点餐服务器，请稍后重试。", timeout:"订单整理时间过长，请重新说一次。", failed:"无法处理语音订单，请重新说。", cartBusy:"请在购物车为空时开始语音点餐。", mic:"请允许使用麦克风。", mockLabel:"预览用点餐语句", cartTitle:"请确认您刚才说的订单", cartCaption:"内容正确时，请点击下方的发送订单按钮。", cartRetry:"重新说", cartSend:"正确 · 发送订单", cartNote:"点击后会将此内容直接发送到 POS。请确认菜品、选项和数量。" },
    en: { button:"Voice order", guide:"Browse the menu and speak naturally, just as you would to a staff member.", connecting:"Connecting voice ordering…", listening:"Listening · Cancel", listeningGuide:"Listening now. Keep browsing and say any cancellations or changes naturally.", finish:"Send voice order", processing:"Organizing what you said…", retry:"Try again", empty:"I could not hear an order.", unavailable:"The voice ordering server cannot be reached right now. Please try again shortly.", timeout:"Organizing the order is taking too long. Please say it again.", failed:"The voice order could not be processed. Please try again.", cartBusy:"Please start voice ordering with an empty cart.", mic:"Please allow microphone access.", mockLabel:"Preview voice order", cartTitle:"Please check the order you just said", cartCaption:"If this is correct, tap the send order button below.", cartRetry:"Say it again", cartSend:"Yes · Send order", cartNote:"Tapping the button sends this order directly to the POS. Check items, options, and quantities first." },
  };
  const voice = { phase:"idle", peer:null, channel:null, stream:null, transcript:"", partial:"", completion:null, timer:null, startedAt:0, busy:false, mock:false, opener:null };
  window.voiceCartReviewActive = false;

  function t(){ return copy[lang] || copy.ko; }
  function el(id){ return document.getElementById(id); }

  function setPhase(phase,message=""){
    voice.phase=phase;
    const c=t(),button=el("voiceOrderButton"),finish=el("voiceFinishButton"),guide=el("voiceGuide"),status=el("voiceInlineStatus"),mockBar=el("voiceMockBar");
    button.hidden=false;button.disabled=false;button.classList.remove("is-listening");finish.hidden=true;status.hidden=true;mockBar.hidden=true;
    if(phase==="idle"){
      guide.hidden=false;guide.textContent=c.guide;el("voiceButtonText").textContent=c.button;el("voiceTimer").textContent="00:00";
    }else if(phase==="connecting"){
      guide.hidden=true;button.disabled=true;el("voiceButtonText").textContent=c.connecting;status.hidden=false;el("voiceInlineStatusText").textContent=c.connecting;
    }else if(phase==="listening"){
      guide.hidden=false;guide.textContent=c.listeningGuide;button.classList.add("is-listening");el("voiceButtonText").textContent=c.listening;finish.hidden=false;updateTimerText();
      if(voice.mock){mockBar.hidden=false;el("voiceMockLabel").textContent=c.mockLabel;el("voiceMockSend").textContent=c.finish}
    }else if(phase==="processing"){
      guide.hidden=true;button.hidden=true;finish.hidden=true;status.hidden=false;el("voiceInlineStatusText").textContent=message||c.processing;
    }else{
      guide.hidden=false;guide.textContent=message||c.failed;el("voiceButtonText").textContent=c.retry;
    }
  }

  function updateVoiceLanguage(){ setPhase(voice.phase,voice.phase==="error"?el("voiceGuide").textContent:""); }

  function openVoiceOrder(opener){
    const c=t();
    if(voice.phase==="listening"){closeVoiceOrder();return}
    if(voice.busy||orderSending)return;
    if(!selectedTable){showToast(startCopy[lang]?.title||startCopy.ko.title);return}
    if(!PREVIEW_MODE&&!catalogReady){showToast(c.failed);return}
    if(cartItems.length){showToast(c.cartBusy);return}
    voice.opener=opener;voice.transcript="";voice.partial="";voice.mock=false;el("voiceMockTranscript").value="";startVoiceListening();
  }

  async function startVoiceListening(){
    if(voice.busy)return;
    if(PREVIEW_MODE&&PAGE_PARAMS.get("voiceMock")==="1"){
      voice.mock=true;voice.startedAt=Date.now();startTimer();setPhase("listening");setTimeout(()=>el("voiceMockTranscript").focus(),0);return;
    }
    voice.busy=true;setPhase("connecting");
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      const pc=new RTCPeerConnection(),channel=pc.createDataChannel("oai-events");
      voice.stream=stream;voice.peer=pc;voice.channel=channel;
      stream.getTracks().forEach(track=>pc.addTrack(track,stream));channel.addEventListener("message",handleRealtimeEvent);
      const offer=await pc.createOffer();await pc.setLocalDescription(offer);
      const response=await fetchWithTimeout(`${API_BASE}/api/voice/realtime`,{method:"POST",headers:{"Content-Type":"application/sdp","X-Dabang-Table-Id":String(selectedTable.id)},body:offer.sdp},12000);
      if(!response.ok){const result=await response.json().catch(()=>({}));throw new Error(result.code==="VOICE_NOT_CONFIGURED"?t().unavailable:t().failed)}
      await pc.setRemoteDescription({type:"answer",sdp:await response.text()});await waitForChannel(channel,5000);
      voice.busy=false;voice.startedAt=Date.now();startTimer();setPhase("listening");
    }catch(error){stopVoiceConnection();voice.busy=false;const denied=error?.name==="NotAllowedError"||error?.name==="PermissionDeniedError";setPhase("error",denied?t().mic:friendlyError(error))}
  }

  function handleRealtimeEvent(event){
    let data;try{data=JSON.parse(event.data)}catch{return}
    if(data.type==="conversation.item.input_audio_transcription.delta")voice.partial+=String(data.delta||"");
    if(data.type==="conversation.item.input_audio_transcription.completed"){
      voice.transcript=String(data.transcript||voice.partial||"").trim();if(voice.completion)voice.completion(voice.transcript);
    }
    if(data.type==="error"&&voice.completion)voice.completion("");
  }

  async function finishVoiceListening(){
    if(voice.busy||voice.phase!=="listening")return;
    voice.busy=true;stopTimer();setPhase("processing");
    try{
      let transcript="";
      if(voice.mock)transcript=el("voiceMockTranscript").value.trim();
      else{
        const transcriptPromise=new Promise(resolve=>{voice.completion=resolve;setTimeout(()=>resolve(voice.transcript||voice.partial),8000)});
        voice.channel.send(JSON.stringify({type:"input_audio_buffer.commit"}));transcript=String(await transcriptPromise||"").trim();voice.completion=null;stopVoiceConnection();
      }
      if(!transcript)throw new Error(t().empty);voice.transcript=transcript;await interpretTranscript(transcript);
    }catch(error){stopVoiceConnection();setPhase("error",friendlyError(error))}finally{voice.busy=false}
  }

  async function interpretTranscript(transcript){
    const response=await fetchWithTimeout(`${API_BASE}/api/voice/interpret`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({transcript,catalogRevision:String(state.catalogRevision||""),language:lang,tableId:String(selectedTable?.id||"")})},8000);
    const result=await response.json().catch(()=>({}));if(!response.ok||result.ok===false)throw new Error(result.code==="VOICE_NOT_CONFIGURED"?t().unavailable:t().failed);
    if(!result.ready)throw new Error(result.questions?.[0]||t().failed);
    cartItems=result.items.map(item=>({lineId:++cartLineSequence,key:String(item.menuId)+"|"+(item.selections||[]).map(row=>row.templateId+":"+row.valueId).sort().join(","),menuId:String(item.menuId),basePrice:Number(item.basePrice)||0,unitPrice:Number(item.unitPrice)||0,quantity:Number(item.quantity)||1,selections:(item.selections||[]).map(row=>{const template=state.optionTemplates.find(group=>String(group.id)===String(row.templateId));return{...row,groupNames:template?.names||{}}})}));
    pendingOrderPayload=null;recalculateCart();window.voiceCartReviewActive=true;resetVoiceHeader();showCartSummary(voice.opener||document.querySelector(".voice-order-button"));
  }

  function getVoiceCartReviewCopy(){const c=t();return{title:c.cartTitle,caption:c.cartCaption,retry:c.cartRetry,send:c.cartSend,note:c.cartNote}}
  function restartVoiceOrderFromCart(){
    if(orderSending)return;deactivateDialogLayer(el("cartModal"),false);window.voiceCartReviewActive=false;cartItems=[];pendingOrderPayload=null;recalculateCart();setTimeout(()=>openVoiceOrder(el("voiceOrderButton")),0);
  }
  function closeVoiceOrder(force=false){if(voice.busy&&!force)return;stopVoiceConnection();voice.busy=false;voice.mock=false;resetVoiceHeader()}
  function resetVoiceHeader(){stopVoiceConnection();voice.phase="idle";voice.mock=false;el("voiceMockTranscript").value="";setPhase("idle")}
  function waitForChannel(channel,timeout){return new Promise((resolve,reject)=>{if(channel.readyState==="open"){resolve();return}const timer=setTimeout(()=>reject(new Error(t().failed)),timeout);channel.addEventListener("open",()=>{clearTimeout(timer);resolve()},{once:true})})}
  async function fetchWithTimeout(url,options,timeout){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);try{return await fetch(url,{...options,signal:controller.signal})}finally{clearTimeout(timer)}}
  function friendlyError(error){if(error?.name==="AbortError")return t().timeout;const message=String(error?.message||"");if(error instanceof TypeError||/failed to fetch|networkerror|load failed/i.test(message))return t().unavailable;return message||t().failed}
  function updateTimerText(){const seconds=Math.min(MAX_SECONDS,Math.max(0,Math.floor((Date.now()-voice.startedAt)/1000))),clock=`${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;el("voiceTimer").textContent=clock;el("voiceFinishText").textContent=`${t().finish} · ${clock}`}
  function startTimer(){stopTimer();updateTimerText();voice.timer=setInterval(()=>{updateTimerText();if(Date.now()-voice.startedAt>=MAX_SECONDS*1000)finishVoiceListening()},250)}
  function stopTimer(){if(voice.timer)clearInterval(voice.timer);voice.timer=null}
  function stopVoiceConnection(){stopTimer();voice.completion=null;if(voice.stream)voice.stream.getTracks().forEach(track=>track.stop());if(voice.channel)try{voice.channel.close()}catch{}if(voice.peer)try{voice.peer.close()}catch{}voice.stream=null;voice.channel=null;voice.peer=null}

  window.openVoiceOrder=openVoiceOrder;window.closeVoiceOrder=closeVoiceOrder;window.finishVoiceListening=finishVoiceListening;window.updateVoiceLanguage=updateVoiceLanguage;window.getVoiceCartReviewCopy=getVoiceCartReviewCopy;window.restartVoiceOrderFromCart=restartVoiceOrderFromCart;
  setPhase("idle");
})();
