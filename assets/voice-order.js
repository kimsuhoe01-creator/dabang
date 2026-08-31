(() => {
  const API_BASE = ORDER_ENDPOINT.replace(/\/api\/cukcuk\/order$/, "");
  const MAX_SECONDS = 90;
  const copy = {
    ko: { button:"음성 주문", title:"말로 주문하기", caption:"편하게 말씀하신 뒤 듣기 완료를 눌러 주세요.", ready:"주문을 들을 준비가 됐습니다.", start:"듣기 시작", listening:"말씀해 주세요. 취소나 변경도 자연스럽게 말하면 됩니다.", finish:"듣기 완료", heard:"들은 내용", placeholder:"듣기 시작을 누르고 주문을 말씀해 주세요.", processing:"말씀하신 내용을 메뉴와 연결하고 있습니다…", review:"이렇게 주문할까요?", retry:"다시 말하기", send:"맞아요 · 주문 전송", cancel:"취소", empty:"말씀하신 주문을 듣지 못했습니다.", unavailable:"지금은 음성 주문 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.", timeout:"주문 정리가 오래 걸리고 있습니다. 다시 말해 주세요.", failed:"음성 주문을 처리하지 못했습니다. 다시 말해 주세요.", cartBusy:"음성 주문은 빈 장바구니에서 시작해 주세요.", mic:"마이크 사용을 허용해 주세요.", preview:"미리보기용 문장을 입력해 주세요.", organize:"주문 정리", option:"옵션" },
    vi: { button:"Gọi món bằng giọng nói", title:"Gọi món bằng giọng nói", caption:"Hãy nói tự nhiên rồi nhấn Hoàn tất nghe.", ready:"Sẵn sàng nghe món bạn gọi.", start:"Bắt đầu nghe", listening:"Hãy nói món, số lượng và cả thay đổi hoặc hủy món.", finish:"Hoàn tất nghe", heard:"Nội dung đã nghe", placeholder:"Nhấn Bắt đầu nghe rồi nói món bạn muốn gọi.", processing:"Đang đối chiếu lời nói với thực đơn…", review:"Bạn muốn gọi như thế này đúng không?", retry:"Nói lại", send:"Đúng · Gửi đơn", cancel:"Hủy", empty:"Không nghe được nội dung gọi món.", unavailable:"Hiện không thể kết nối với máy chủ gọi món bằng giọng nói. Vui lòng thử lại sau.", timeout:"Việc sắp xếp đơn đang mất quá nhiều thời gian. Vui lòng nói lại.", failed:"Không thể xử lý đơn giọng nói. Vui lòng nói lại.", cartBusy:"Vui lòng dùng giọng nói khi giỏ hàng đang trống.", mic:"Vui lòng cho phép sử dụng micrô.", preview:"Nhập câu gọi món để xem thử.", organize:"Sắp xếp đơn", option:"Tùy chọn" },
    zh: { button:"语音点餐", title:"语音点餐", caption:"请自然说出订单，然后点击结束收听。", ready:"已准备好听取您的订单。", start:"开始收听", listening:"请说出菜品、数量以及取消或修改内容。", finish:"结束收听", heard:"听到的内容", placeholder:"点击开始收听后说出您要点的菜。", processing:"正在将您的话与菜单匹配…", review:"您要这样下单吗？", retry:"重新说", send:"正确 · 发送订单", cancel:"取消", empty:"没有听到订单内容。", unavailable:"目前无法连接语音点餐服务器，请稍后重试。", timeout:"订单整理时间过长，请重新说一次。", failed:"无法处理语音订单，请重新说。", cartBusy:"请在购物车为空时使用语音点餐。", mic:"请允许使用麦克风。", preview:"请输入用于预览的点餐语句。", organize:"整理订单", option:"选项" },
    en: { button:"Voice order", title:"Order by voice", caption:"Speak naturally, then tap Finish listening.", ready:"Ready to listen to your order.", start:"Start listening", listening:"Say items, quantities, cancellations, and changes naturally.", finish:"Finish listening", heard:"What I heard", placeholder:"Tap Start listening and say your order.", processing:"Matching what you said to the menu…", review:"Would you like to send this order?", retry:"Say it again", send:"Yes · Send order", cancel:"Cancel", empty:"I could not hear an order.", unavailable:"The voice ordering server cannot be reached right now. Please try again shortly.", timeout:"Organizing the order is taking too long. Please say it again.", failed:"The voice order could not be processed. Please try again.", cartBusy:"Please start voice ordering with an empty cart.", mic:"Please allow microphone access.", preview:"Enter a sample spoken order for preview.", organize:"Organize order", option:"Option" },
  };
  const voice = { phase:"idle", peer:null, channel:null, stream:null, transcript:"", partial:"", draft:null, completion:null, timer:null, startedAt:0, busy:false };

  function t(){ return copy[lang] || copy.ko; }
  function el(id){ return document.getElementById(id); }
  function voiceModal(){ return el("voiceModal"); }
  function voicePanel(){ return voiceModal().querySelector(".voice-order-dialog"); }

  function updateVoiceLanguage(){
    const c=t();
    el("voiceButtonText").textContent=c.button;el("voiceTitle").textContent=c.title;el("voiceCaption").textContent=c.caption;el("voiceTranscriptLabel").textContent=c.heard;el("voiceReviewTitle").textContent=c.review;
    if(voice.phase==="idle")setPhase("idle");
  }

  function setPhase(phase,message=""){
    voice.phase=phase;voicePanel().dataset.phase=phase;
    const c=t(),orb=el("voiceOrb"),primary=el("voicePrimary"),secondary=el("voiceSecondary"),mock=el("voiceMockTranscript");
    orb.classList.toggle("listening",phase==="listening");orb.classList.toggle("processing",phase==="processing");
    primary.disabled=false;primary.hidden=false;secondary.hidden=false;mock.hidden=true;
    el("voiceReview").hidden=phase!=="review";el("voiceClose").disabled=voice.busy;
    if(phase==="idle"){
      el("voiceStatus").textContent=message||c.ready;el("voiceTranscript").textContent=c.placeholder;el("voicePrimaryText").textContent=c.start;secondary.textContent=c.cancel;el("voiceTimer").textContent="00:00";
    }else if(phase==="listening"){
      el("voiceStatus").textContent=c.listening;el("voicePrimaryText").textContent=c.finish;secondary.textContent=c.cancel;
    }else if(phase==="processing"){
      el("voiceStatus").textContent=message||c.processing;el("voicePrimaryText").textContent=c.processing;primary.disabled=true;secondary.hidden=true;
    }else if(phase==="mock"){
      el("voiceStatus").textContent=c.preview;mock.hidden=false;mock.placeholder=c.preview;el("voicePrimaryText").textContent=c.organize;secondary.textContent=c.cancel;
    }else if(phase==="review"){
      el("voiceStatus").textContent=message||c.review;el("voicePrimaryText").textContent=voice.draft?.ready?c.send:c.organize;primary.disabled=!voice.draft?.ready;secondary.textContent=c.retry;
    }else{
      el("voiceStatus").textContent=message||c.failed;el("voicePrimaryText").textContent=c.start;secondary.textContent=c.cancel;
    }
  }

  function openVoiceOrder(opener){
    const c=t();
    if(orderSending)return;
    if(!selectedTable){showToast(startCopy[lang]?.title||startCopy.ko.title);return}
    if(!PREVIEW_MODE&&!catalogReady){showToast(c.failed);return}
    if(cartItems.length){showToast(c.cartBusy);return}
    voice.transcript="";voice.partial="";voice.draft=null;el("voiceReview").hidden=true;el("voiceMockTranscript").value="";setPhase("idle");updateVoiceLanguage();activateDialogLayer(voiceModal(),opener);
  }

  async function startVoiceListening(){
    if(voice.busy)return;
    if(PREVIEW_MODE&&PAGE_PARAMS.get("voiceMock")==="1"){setPhase("mock");el("voiceMockTranscript").focus();return}
    voice.busy=true;setPhase("processing",t().ready);
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      const pc=new RTCPeerConnection();const channel=pc.createDataChannel("oai-events");
      voice.stream=stream;voice.peer=pc;voice.channel=channel;voice.transcript="";voice.partial="";
      stream.getTracks().forEach(track=>pc.addTrack(track,stream));
      channel.addEventListener("message",handleRealtimeEvent);
      const offer=await pc.createOffer();await pc.setLocalDescription(offer);
      const response=await fetchWithTimeout(`${API_BASE}/api/voice/realtime`,{method:"POST",headers:{"Content-Type":"application/sdp","X-Dabang-Table-Id":String(selectedTable.id)},body:offer.sdp},12000);
      if(!response.ok){const result=await response.json().catch(()=>({}));throw new Error(result.message||t().unavailable)}
      await pc.setRemoteDescription({type:"answer",sdp:await response.text()});
      await waitForChannel(channel,5000);
      voice.busy=false;voice.startedAt=Date.now();startTimer();setPhase("listening");
    }catch(error){
      stopVoiceConnection();voice.busy=false;const denied=error?.name==="NotAllowedError"||error?.name==="PermissionDeniedError";setPhase("error",denied?t().mic:friendlyError(error));
    }
  }

  function handleRealtimeEvent(event){
    let data;try{data=JSON.parse(event.data)}catch{return}
    if(data.type==="conversation.item.input_audio_transcription.delta"){
      voice.partial+=String(data.delta||"");el("voiceTranscript").textContent=voice.partial||t().placeholder;
    }
    if(data.type==="conversation.item.input_audio_transcription.completed"){
      voice.transcript=String(data.transcript||voice.partial||"").trim();el("voiceTranscript").textContent=voice.transcript||t().empty;if(voice.completion)voice.completion(voice.transcript);
    }
    if(data.type==="error"&&voice.completion)voice.completion("");
  }

  async function finishVoiceListening(){
    if(voice.busy||voice.phase!=="listening")return;voice.busy=true;stopTimer();setPhase("processing");
    try{
      const transcriptPromise=new Promise(resolve=>{voice.completion=resolve;setTimeout(()=>resolve(voice.transcript||voice.partial),8000)});
      voice.channel.send(JSON.stringify({type:"input_audio_buffer.commit"}));
      const transcript=String(await transcriptPromise||"").trim();voice.completion=null;stopVoiceConnection();
      if(!transcript)throw new Error(t().empty);voice.transcript=transcript;el("voiceTranscript").textContent=transcript;await interpretTranscript(transcript);
    }catch(error){stopVoiceConnection();setPhase("error",friendlyError(error))}finally{voice.busy=false;el("voiceClose").disabled=false}
  }

  async function interpretTranscript(transcript){
    setPhase("processing");
    const response=await fetchWithTimeout(`${API_BASE}/api/voice/interpret`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({transcript,catalogRevision:String(state.catalogRevision||""),language:lang,tableId:String(selectedTable?.id||"")})},8000);
    const result=await response.json().catch(()=>({}));if(!response.ok||result.ok===false)throw new Error(result.message||t().failed);
    voice.draft=result;renderVoiceDraft(result);setPhase("review",result.ready?t().review:(result.questions?.[0]||t().failed));
  }

  function renderVoiceDraft(draft){
    el("voiceReviewTotal").textContent=money(Number(draft.total)||0);
    el("voiceReviewLines").innerHTML=(draft.items||[]).map(item=>{
      const name=localizedNames(item.menuNames)||item.menuId,options=(item.selections||[]).map(row=>localizedNames(row.valueNames)).filter(Boolean).join(", ");
      return `<div class="voice-review-line"><strong>${escapeHtml(name)}</strong><span>${item.quantity} × ${money(item.unitPrice)}</span>${options?`<small>${escapeHtml(t().option)} · ${escapeHtml(options)}</small>`:""}</div>`;
    }).join("")||`<div class="cart-empty">${escapeHtml(t().empty)}</div>`;
    const questions=(draft.questions||[]).filter(Boolean);el("voiceQuestions").hidden=!questions.length;el("voiceQuestions").innerHTML=questions.map(question=>`<p>${escapeHtml(question)}</p>`).join("");
  }

  async function sendVoiceOrder(){
    if(!voice.draft?.ready||voice.busy)return;voice.busy=true;setPhase("processing",PREVIEW_MODE?words[lang].previewSend:words[lang].sending);
    try{
      cartItems=voice.draft.items.map(item=>({lineId:++cartLineSequence,key:String(item.menuId)+"|"+(item.selections||[]).map(row=>row.templateId+":"+row.valueId).sort().join(","),menuId:String(item.menuId),basePrice:Number(item.basePrice)||0,unitPrice:Number(item.unitPrice)||0,quantity:Number(item.quantity)||1,selections:(item.selections||[]).map(row=>{const template=state.optionTemplates.find(group=>String(group.id)===String(row.templateId));return{...row,groupNames:template?.names||{}}})}));
      pendingOrderPayload=null;recalculateCart();deactivateDialogLayer(voiceModal(),false);await submitOrder();
      if(!el("successModal").classList.contains("open"))showCartSummary(document.querySelector(".cart"));
    }finally{voice.busy=false}
  }

  function handleVoicePrimary(){
    if(voice.phase==="listening"){finishVoiceListening();return}
    if(voice.phase==="mock"){
      const transcript=el("voiceMockTranscript").value.trim();if(!transcript){setPhase("error",t().empty);return}voice.transcript=transcript;el("voiceTranscript").textContent=transcript;voice.busy=true;interpretTranscript(transcript).catch(error=>setPhase("error",friendlyError(error))).finally(()=>{voice.busy=false;el("voiceClose").disabled=false});return;
    }
    if(voice.phase==="review"&&voice.draft?.ready){sendVoiceOrder();return}
    startVoiceListening();
  }

  function handleVoiceSecondary(){
    if(voice.phase==="review"){voice.draft=null;voice.transcript="";voice.partial="";el("voiceReview").hidden=true;startVoiceListening();return}
    closeVoiceOrder();
  }

  function closeVoiceOrder(force=false){
    if(voice.busy&&!force)return;stopVoiceConnection();voice.busy=false;voice.draft=null;deactivateDialogLayer(voiceModal());
  }
  function waitForChannel(channel,timeout){return new Promise((resolve,reject)=>{if(channel.readyState==="open"){resolve();return}const timer=setTimeout(()=>reject(new Error(t().failed)),timeout);channel.addEventListener("open",()=>{clearTimeout(timer);resolve()},{once:true})})}
  async function fetchWithTimeout(url,options,timeout){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);try{return await fetch(url,{...options,signal:controller.signal})}finally{clearTimeout(timer)}}
  function friendlyError(error){if(error?.name==="AbortError")return t().timeout;const message=String(error?.message||"");if(error instanceof TypeError||/failed to fetch|networkerror|load failed/i.test(message))return t().unavailable;return message||t().failed}
  function startTimer(){stopTimer();voice.timer=setInterval(()=>{const seconds=Math.min(MAX_SECONDS,Math.floor((Date.now()-voice.startedAt)/1000));el("voiceTimer").textContent=`${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;if(seconds>=MAX_SECONDS)finishVoiceListening()},250)}
  function stopTimer(){if(voice.timer)clearInterval(voice.timer);voice.timer=null}
  function stopVoiceConnection(){stopTimer();voice.completion=null;if(voice.stream)voice.stream.getTracks().forEach(track=>track.stop());if(voice.channel)try{voice.channel.close()}catch{}if(voice.peer)try{voice.peer.close()}catch{}voice.stream=null;voice.channel=null;voice.peer=null}

  window.openVoiceOrder=openVoiceOrder;window.closeVoiceOrder=closeVoiceOrder;window.handleVoicePrimary=handleVoicePrimary;window.handleVoiceSecondary=handleVoiceSecondary;window.updateVoiceLanguage=updateVoiceLanguage;
  updateVoiceLanguage();
})();
