(function(){
  'use strict';

  const OUTPUT_SIZE=1024;
  const AI_ENDPOINT='https://dabang-cukcuk-order-api.kimsuhoe01.workers.dev/api/admin/image-expand';
  const photoPreviewOverrides=new Map();
  const state={menuId:null,image:null,sourceBlob:null,originalBlob:null,sourceName:'',mode:'cover',zoom:1,offsetX:0,offsetY:0,blur:26,dragging:false,dragX:0,dragY:0};
  let assetsDirectoryHandle=null;
  let previewObjectUrl='';
  let runtimeOpenAIKey='';

  function install(){
    const legacyUpload=document.querySelector('#modal .upload');
    if(legacyUpload){
      legacyUpload.outerHTML=`<section class="menu-photo-panel" id="editPhotoPanel"><div class="menu-photo-panel-preview" id="editPhotoThumb">사진 없음</div><div class="menu-photo-panel-copy"><strong id="editPhotoTitle">메뉴 사진</strong><p id="editPhotoDescription">정사각형 자르기, 위치 조절, 블러 여백 채우기를 사용할 수 있습니다.</p><div class="menu-photo-panel-actions"><button class="primary-photo-action" type="button" onclick="openImageEditor()">사진 바꾸기·조절</button><button type="button" onclick="downloadCurrentMenuPhoto()">현재 사진 받기</button></div></div></section>`;
    }
    document.body.insertAdjacentHTML('beforeend',editorModalMarkup());
    bindEditorEvents();
    const originalOpenEdit=window.openEdit;
    window.openEdit=function(id){originalOpenEdit(id);refreshEditPhotoPanel()};
  }

  function editorModalMarkup(){return `
    <div class="modal-bg" id="imageEditorModal" aria-hidden="true">
      <div class="modal image-editor-modal" role="dialog" aria-modal="true" aria-labelledby="imageEditorTitle">
        <div class="modal-head"><div><h3 id="imageEditorTitle">메뉴 사진 편집</h3><small id="imageEditorCaption" style="color:#888">정사각형 태블릿 카드에 맞게 조절합니다.</small></div><button class="close" type="button" onclick="closeImageEditor()" aria-label="사진 편집 닫기">×</button></div>
        <div class="modal-body image-editor-body">
          <section class="image-editor-workspace">
            <div class="image-editor-stage" id="imageEditorStage">
              <canvas id="imageEditorCanvas" width="${OUTPUT_SIZE}" height="${OUTPUT_SIZE}" aria-label="편집 사진 미리보기"></canvas>
              <div class="image-editor-empty" id="imageEditorEmpty">사진을 선택하면 이곳에서 바로 조절할 수 있습니다.<br>사진 위를 끌어 위치를 바꿀 수도 있습니다.</div>
              <div class="image-editor-drop" aria-hidden="true"></div>
            </div>
          </section>
          <aside class="image-editor-controls">
            <section class="image-editor-card"><h4>1. 사진 선택</h4><p>휴대폰 사진도 가능하며 결과는 1024 × 1024로 저장됩니다.</p><div class="image-editor-toolbar" style="margin-top:11px"><button class="primary" type="button" onclick="chooseEditorImage()">사진 불러오기</button><button type="button" onclick="restoreOriginalEditorImage()">원본으로</button></div><input class="hidden" id="imageEditorFile" type="file" accept="image/jpeg,image/png,image/webp" onchange="loadEditorFile(event)"><div class="image-quality" id="imageQuality"><i></i><div><strong>사진을 선택해주세요.</strong><span>700px 미만 사진은 화질 경고를 표시합니다.</span></div></div></section>
            <section class="image-editor-card"><h4>2. 맞춤 방식</h4><p>잘라내기는 화면을 꽉 채우고, 블러 여백은 원본 전체를 살립니다.</p><div class="image-mode"><button id="imageModeCover" class="active" type="button" onclick="setEditorMode('cover')">꽉 채워 자르기</button><button id="imageModeBlur" type="button" onclick="setEditorMode('blur')">전체 보기 + 블러</button></div><div class="image-slider"><label for="imageZoom">확대</label><input id="imageZoom" type="range" min="100" max="220" value="100"><output id="imageZoomValue">100%</output></div><div class="image-slider"><label for="imageOffsetX">좌우</label><input id="imageOffsetX" type="range" min="-100" max="100" value="0"><output id="imageOffsetXValue">0</output></div><div class="image-slider"><label for="imageOffsetY">상하</label><input id="imageOffsetY" type="range" min="-100" max="100" value="0"><output id="imageOffsetYValue">0</output></div><div class="image-slider" id="blurSliderRow"><label for="imageBlur">블러</label><input id="imageBlur" type="range" min="8" max="46" value="26"><output id="imageBlurValue">26</output></div><div class="image-editor-toolbar" style="margin-top:12px"><button type="button" onclick="autoFitEditorImage()">자동으로 맞추기</button><button type="button" onclick="resetEditorAdjustments()">조절 초기화</button></div></section>
            <section class="image-editor-card ai-image-card"><h4>✨ AI 여백 채우기</h4><p>원본을 가운데 보존하고 부족한 바깥 공간만 자연스럽게 확장합니다.</p><label class="ai-key-label" for="openAiApiKey">OpenAI API 키</label><input id="openAiApiKey" type="password" autocomplete="off" spellcheck="false" placeholder="sk-..."><div class="ai-key-actions"><button type="button" onclick="applyOpenAIKey()">키 적용</button><button class="secondary" type="button" onclick="clearOpenAIKey()">지우기</button></div><button id="aiExpandButton" type="button" onclick="expandEditorImageWithAI()">AI로 빈 공간 채우기</button><p class="ai-image-note">키는 파일이나 브라우저 저장소에 저장하지 않고 현재 탭 메모리에서만 사용합니다. 새로고침하거나 탭을 닫으면 자동으로 지워집니다. 매장 관리자 PC에서만 사용하세요.</p><div class="ai-image-status" id="aiImageStatus"></div></section>
            <div class="image-editor-save-note">가장 쉬운 저장 방법은 <strong>assets 폴더에 바로 저장</strong>입니다. 저장 후 GitHub Desktop에서 변경 파일을 커밋하고 Push하면 태블릿에 반영됩니다.</div>
          </aside>
        </div>
        <div class="modal-foot"><div class="image-editor-foot-left"><span class="image-editor-folder-state" id="imageFolderState">저장 폴더 미선택</span></div><div class="image-editor-foot-right"><button class="btn" type="button" onclick="downloadEditedImage()">파일로 받기</button><button class="btn primary" type="button" onclick="saveEditedImageToFolder()">assets 폴더에 바로 저장</button></div></div>
      </div>
    </div>`}

  function bindEditorEvents(){
    const sliders=[['imageZoom','zoom',value=>Number(value)/100],['imageOffsetX','offsetX',Number],['imageOffsetY','offsetY',Number],['imageBlur','blur',Number]];
    sliders.forEach(([id,key,convert])=>document.getElementById(id).addEventListener('input',event=>{state[key]=convert(event.target.value);renderEditor()}));
    const stage=document.getElementById('imageEditorStage');
    stage.addEventListener('pointerdown',beginEditorDrag);
    stage.addEventListener('pointermove',moveEditorDrag);
    stage.addEventListener('pointerup',endEditorDrag);
    stage.addEventListener('pointercancel',endEditorDrag);
    stage.addEventListener('dragover',event=>{event.preventDefault();stage.classList.add('drop-active')});
    stage.addEventListener('dragleave',()=>stage.classList.remove('drop-active'));
    stage.addEventListener('drop',event=>{event.preventDefault();stage.classList.remove('drop-active');const file=event.dataTransfer.files?.[0];if(file)loadBlobIntoEditor(file,file.name,true)});
  }

  function refreshEditPhotoPanel(){
    if(typeof editing==='undefined'||!editing)return;
    const thumb=document.getElementById('editPhotoThumb'),src=photoPreviewOverrides.get(editing.id)||menuImage(editing.id);
    document.getElementById('editPhotoTitle').textContent=(editing.n?.ko||editing.sourceName||'메뉴')+' 사진';
    document.getElementById('editPhotoDescription').textContent=src?'현재 사진이 연결되어 있습니다. 바꾸거나 구도를 다시 맞출 수 있습니다.':'사진이 없습니다. 새 사진을 불러와 연결해주세요.';
    thumb.innerHTML=src?`<img src="${escapeAttribute(src)}" alt="">`:'사진 없음';
  }

  async function openImageEditor(){
    if(typeof editing==='undefined'||!editing)return;
    state.menuId=editing.id;
    document.getElementById('imageEditorTitle').textContent=(editing.n?.ko||editing.sourceName||'메뉴')+' 사진 편집';
    document.getElementById('imageEditorCaption').textContent='저장 파일명: '+outputFileName();
    document.getElementById('imageEditorModal').classList.add('open');
    document.getElementById('imageEditorModal').setAttribute('aria-hidden','false');
    setAIStatus('');
    const src=photoPreviewOverrides.get(state.menuId)||menuImage(state.menuId);
    if(!src){clearEditorImage();return}
    try{
      const response=await fetch(src+(src.includes('?')?'&':'?')+'edit='+Date.now(),{cache:'no-store'});
      if(!response.ok)throw new Error('현재 사진을 불러오지 못했습니다.');
      const blob=await response.blob();
      await loadBlobIntoEditor(blob,outputFileName(),true);
    }catch(error){clearEditorImage();toast(error.message||'현재 사진을 불러오지 못했습니다.')}
  }

  function closeImageEditor(){document.getElementById('imageEditorModal').classList.remove('open');document.getElementById('imageEditorModal').setAttribute('aria-hidden','true');state.dragging=false}
  function chooseEditorImage(){document.getElementById('imageEditorFile').click()}
  async function loadEditorFile(event){const input=event.target,file=input.files?.[0];input.value='';if(file)await loadBlobIntoEditor(file,file.name,true)}

  async function loadBlobIntoEditor(blob,name,rememberOriginal){
    if(!blob?.type?.startsWith('image/')){toast('JPG, PNG 또는 WebP 사진을 선택해주세요.');return}
    if(blob.size>25*1024*1024){toast('사진은 25MB 이하만 사용할 수 있습니다.');return}
    const image=await blobToImage(blob);
    state.image=image;state.sourceBlob=blob;state.sourceName=name||'photo';
    if(rememberOriginal)state.originalBlob=blob;
    state.mode=(image.naturalWidth/image.naturalHeight>1.16||image.naturalWidth/image.naturalHeight<.86)?'blur':'cover';
    state.zoom=1;state.offsetX=0;state.offsetY=0;state.blur=26;
    document.getElementById('imageEditorEmpty').classList.add('hidden');
    updateQuality(image,blob);renderEditor();
  }

  async function restoreOriginalEditorImage(){if(!state.originalBlob){toast('복원할 원본 사진이 없습니다.');return}await loadBlobIntoEditor(state.originalBlob,state.sourceName,false);toast('처음 불러온 원본으로 돌아왔습니다.')}
  function clearEditorImage(){state.image=null;state.sourceBlob=null;state.originalBlob=null;document.getElementById('imageEditorEmpty').classList.remove('hidden');updateQuality(null,null);renderEditor()}

  function renderEditor(){
    const canvas=document.getElementById('imageEditorCanvas'),ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,OUTPUT_SIZE,OUTPUT_SIZE);ctx.filter='none';ctx.globalAlpha=1;
    document.getElementById('imageModeCover').classList.toggle('active',state.mode==='cover');
    document.getElementById('imageModeBlur').classList.toggle('active',state.mode==='blur');
    document.getElementById('blurSliderRow').style.display=state.mode==='blur'?'grid':'none';
    syncControls();
    if(!state.image)return;
    if(state.mode==='blur')drawBlurComposition(ctx,state.image);else drawCoverComposition(ctx,state.image);
  }

  function drawCoverComposition(ctx,image){
    ctx.fillStyle='#eee9e1';ctx.fillRect(0,0,OUTPUT_SIZE,OUTPUT_SIZE);
    const scale=Math.max(OUTPUT_SIZE/image.naturalWidth,OUTPUT_SIZE/image.naturalHeight)*state.zoom;
    const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
    const maxX=Math.max(0,(width-OUTPUT_SIZE)/2),maxY=Math.max(0,(height-OUTPUT_SIZE)/2);
    const x=(OUTPUT_SIZE-width)/2+(state.offsetX/100)*maxX,y=(OUTPUT_SIZE-height)/2+(state.offsetY/100)*maxY;
    ctx.drawImage(image,x,y,width,height);
  }

  function drawBlurComposition(ctx,image){
    const bgScale=Math.max(OUTPUT_SIZE/image.naturalWidth,OUTPUT_SIZE/image.naturalHeight)*1.09,bgWidth=image.naturalWidth*bgScale,bgHeight=image.naturalHeight*bgScale;
    ctx.save();ctx.filter=`blur(${state.blur}px) brightness(.76) saturate(.9)`;ctx.drawImage(image,(OUTPUT_SIZE-bgWidth)/2,(OUTPUT_SIZE-bgHeight)/2,bgWidth,bgHeight);ctx.restore();
    const scale=Math.min(OUTPUT_SIZE/image.naturalWidth,OUTPUT_SIZE/image.naturalHeight)*state.zoom,width=image.naturalWidth*scale,height=image.naturalHeight*scale;
    const travelX=Math.max(18,(OUTPUT_SIZE-Math.min(width,OUTPUT_SIZE))*.42),travelY=Math.max(18,(OUTPUT_SIZE-Math.min(height,OUTPUT_SIZE))*.42);
    const x=(OUTPUT_SIZE-width)/2+(state.offsetX/100)*travelX,y=(OUTPUT_SIZE-height)/2+(state.offsetY/100)*travelY;
    ctx.drawImage(image,x,y,width,height);
  }

  function syncControls(){
    const values={imageZoom:Math.round(state.zoom*100),imageOffsetX:Math.round(state.offsetX),imageOffsetY:Math.round(state.offsetY),imageBlur:Math.round(state.blur)};
    Object.entries(values).forEach(([id,value])=>{const input=document.getElementById(id),output=document.getElementById(id+'Value');if(document.activeElement!==input)input.value=value;if(output)output.value=id==='imageZoom'?value+'%':value});
  }
  function setEditorMode(mode){state.mode=mode;state.zoom=1;state.offsetX=0;state.offsetY=0;renderEditor()}
  function autoFitEditorImage(){if(!state.image)return;const ratio=state.image.naturalWidth/state.image.naturalHeight;state.mode=(ratio>1.16||ratio<.86)?'blur':'cover';state.zoom=1;state.offsetX=0;state.offsetY=0;renderEditor();toast(state.mode==='blur'?'원본 전체가 보이도록 블러 여백을 적용했습니다.':'사진이 꽉 차도록 자동으로 맞췄습니다.')}
  function resetEditorAdjustments(){state.zoom=1;state.offsetX=0;state.offsetY=0;state.blur=26;renderEditor()}

  function beginEditorDrag(event){if(!state.image)return;state.dragging=true;state.dragX=event.clientX;state.dragY=event.clientY;event.currentTarget.setPointerCapture?.(event.pointerId);event.currentTarget.classList.add('dragging')}
  function moveEditorDrag(event){if(!state.dragging)return;const stage=document.getElementById('imageEditorStage'),rect=stage.getBoundingClientRect(),factor=state.mode==='blur'?390:210;state.offsetX=clamp(state.offsetX+(event.clientX-state.dragX)/rect.width*factor,-100,100);state.offsetY=clamp(state.offsetY+(event.clientY-state.dragY)/rect.height*factor,-100,100);state.dragX=event.clientX;state.dragY=event.clientY;renderEditor()}
  function endEditorDrag(event){if(!state.dragging)return;state.dragging=false;event.currentTarget.releasePointerCapture?.(event.pointerId);event.currentTarget.classList.remove('dragging')}

  function updateQuality(image,blob){
    const box=document.getElementById('imageQuality');
    if(!image){box.className='image-quality';box.innerHTML='<i></i><div><strong>사진을 선택해주세요.</strong><span>700px 미만 사진은 화질 경고를 표시합니다.</span></div>';return}
    const low=Math.min(image.naturalWidth,image.naturalHeight)<700,size=blob?formatBytes(blob.size):'';
    box.className='image-quality'+(low?' warn':'');
    box.innerHTML=`<i></i><div><strong>${low?'화질이 조금 작습니다.':'태블릿용으로 충분한 크기입니다.'}</strong><span>${image.naturalWidth} × ${image.naturalHeight}${size?' · '+size:''}${low?' · 가능하면 더 큰 원본을 권장합니다.':''}</span></div>`;
  }

  async function downloadCurrentMenuPhoto(){
    if(typeof editing==='undefined'||!editing)return;const src=photoPreviewOverrides.get(editing.id)||menuImage(editing.id);if(!src){toast('현재 연결된 사진이 없습니다.');return}
    try{const response=await fetch(src+(src.includes('?')?'&':'?')+'download='+Date.now(),{cache:'no-store'});if(!response.ok)throw new Error();downloadBlob(await response.blob(),outputFileName(editing.id));toast('현재 메뉴 사진을 저장했습니다.')}catch{toast('현재 사진을 내려받지 못했습니다.')}
  }

  async function downloadEditedImage(){if(!state.image){toast('먼저 사진을 선택해주세요.');return}const blob=await editorOutputBlob();downloadBlob(blob,outputFileName());rememberPreview(blob);toast('편집한 사진 파일을 저장했습니다.')}

  async function saveEditedImageToFolder(){
    if(!state.image){toast('먼저 사진을 선택해주세요.');return}
    if(!('showDirectoryPicker' in window)){await downloadEditedImage();toast('이 브라우저는 폴더 저장을 지원하지 않아 파일로 받았습니다.');return}
    try{
      if(!assetsDirectoryHandle)assetsDirectoryHandle=await window.showDirectoryPicker({id:'dabang-menu-assets',mode:'readwrite'});
      let menuDirectory=assetsDirectoryHandle;
      if(assetsDirectoryHandle.name!=='menu')menuDirectory=await assetsDirectoryHandle.getDirectoryHandle('menu');
      const blob=await editorOutputBlob(),name=outputFileName(),fileHandle=await menuDirectory.getFileHandle(name,{create:true}),writable=await fileHandle.createWritable();
      await writable.write(blob);await writable.close();rememberPreview(blob);refreshEditPhotoPanel();updateEditedRowPreview();
      document.getElementById('imageFolderState').textContent=`${assetsDirectoryHandle.name} 폴더 연결됨 · ${name}`;
      toast('메뉴 사진을 폴더에 저장했습니다. GitHub Desktop에서 Push해주세요.');
    }catch(error){if(error?.name!=='AbortError')toast(error?.message?.includes("'menu'")?'assets 폴더 또는 assets/menu 폴더를 선택해주세요.':'폴더에 사진을 저장하지 못했습니다.')}
  }

  async function expandEditorImageWithAI(){
    if(!state.image){toast('먼저 원본 사진을 선택해주세요.');return}
    if(!runtimeOpenAIKey){setAIStatus('OpenAI API 키를 입력한 뒤 ‘키 적용’을 눌러주세요.',true);document.getElementById('openAiApiKey').focus();return}
    const button=document.getElementById('aiExpandButton');button.disabled=true;button.textContent='AI가 여백을 만드는 중…';setAIStatus('원본 중앙은 유지하고 바깥 여백만 생성하고 있습니다.');
    try{
      const {imageBlob,maskBlob}=await buildAIInput();
      const form=new FormData();form.append('image',imageBlob,'menu-input.png');form.append('mask',maskBlob,'menu-mask.png');form.append('menuName',typeof editing!=='undefined'&&editing?(editing.n?.ko||editing.sourceName||'restaurant menu item'):'restaurant menu item');
      const response=await fetch(AI_ENDPOINT,{method:'POST',headers:{Authorization:`Bearer ${runtimeOpenAIKey}`},body:form});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.ok)throw new Error(aiErrorMessage(result,response.status));
      const resultBlob=base64ToBlob(result.image,result.mimeType||'image/jpeg');
      await loadBlobIntoEditor(resultBlob,'ai-expanded.jpg',false);state.mode='cover';state.zoom=1;state.offsetX=0;state.offsetY=0;renderEditor();setAIStatus('AI 여백 채우기가 완료됐습니다. 원본과 비교한 뒤 저장해주세요.');
    }catch(error){setAIStatus(error.message||'AI 편집을 완료하지 못했습니다.',true)}finally{button.disabled=false;button.textContent='AI로 빈 공간 채우기'}
  }

  async function buildAIInput(){
    const input=document.createElement('canvas'),mask=document.createElement('canvas');input.width=input.height=mask.width=mask.height=OUTPUT_SIZE;
    const inputContext=input.getContext('2d'),maskContext=mask.getContext('2d'),image=state.image;
    const scale=Math.min(OUTPUT_SIZE/image.naturalWidth,OUTPUT_SIZE/image.naturalHeight),width=Math.round(image.naturalWidth*scale),height=Math.round(image.naturalHeight*scale),x=Math.round((OUTPUT_SIZE-width)/2),y=Math.round((OUTPUT_SIZE-height)/2);
    inputContext.clearRect(0,0,OUTPUT_SIZE,OUTPUT_SIZE);inputContext.drawImage(image,x,y,width,height);
    maskContext.clearRect(0,0,OUTPUT_SIZE,OUTPUT_SIZE);maskContext.fillStyle='#fff';maskContext.fillRect(Math.max(0,x+3),Math.max(0,y+3),Math.max(1,width-6),Math.max(1,height-6));
    return{imageBlob:await canvasBlob(input,'image/png'),maskBlob:await canvasBlob(mask,'image/png')};
  }

  function applyOpenAIKey(){
    const input=document.getElementById('openAiApiKey'),value=input.value.trim();
    if(value.length<20){setAIStatus('올바른 OpenAI API 키를 입력해주세요.',true);input.focus();return}
    runtimeOpenAIKey=value;
    input.value='';
    input.placeholder='키 적용됨 · 새로고침하면 지워집니다';
    setAIStatus('OpenAI API 키가 현재 탭에 적용됐습니다. 이제 AI 여백 채우기를 사용할 수 있습니다.');
  }
  function clearOpenAIKey(){
    runtimeOpenAIKey='';
    const input=document.getElementById('openAiApiKey');
    input.value='';input.placeholder='sk-...';
    setAIStatus('OpenAI API 키를 현재 탭에서 지웠습니다.');
  }
  function aiErrorMessage(result,status){if(status===401)return'OpenAI API 키가 올바르지 않거나 사용할 수 없습니다. 키를 다시 입력하고 적용해주세요.';if(status===429)return'OpenAI 사용 한도 또는 요청 한도에 도달했습니다. 결제 상태를 확인하거나 잠시 후 다시 시도해주세요.';return result.message||'AI 이미지 편집 요청에 실패했습니다.'}
  function setAIStatus(message,error=false){const box=document.getElementById('aiImageStatus');box.textContent=message;box.className='ai-image-status'+(message?' show':'')+(error?' error':'')}

  function outputExtension(id=state.menuId){const src=id?menuImage(id):'';return /\.png(?:$|\?)/i.test(src)?'png':'jpg'}
  function outputFileName(id=state.menuId){return `${id||'menu-photo'}.${outputExtension(id)}`}
  async function editorOutputBlob(){const extension=outputExtension();return canvasBlob(document.getElementById('imageEditorCanvas'),extension==='png'?'image/png':'image/jpeg',.9)}
  function canvasBlob(canvas,type,quality){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('사진 파일을 만들지 못했습니다.')),type,quality))}
  function blobToImage(blob){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(blob),image=new Image();image.onload=()=>{URL.revokeObjectURL(url);resolve(image)};image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('사진을 읽지 못했습니다.'))};image.src=url})}
  function downloadBlob(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  function rememberPreview(blob){if(previewObjectUrl)URL.revokeObjectURL(previewObjectUrl);previewObjectUrl=URL.createObjectURL(blob);photoPreviewOverrides.set(state.menuId,previewObjectUrl)}
  function updateEditedRowPreview(){const photo=document.querySelector(`#menuRows tr[data-menu-id="${CSS.escape(state.menuId)}"] .photo`);if(photo&&previewObjectUrl)photo.innerHTML=`<img src="${previewObjectUrl}" alt="">`}
  function base64ToBlob(value,type){const binary=atob(value),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return new Blob([bytes],{type})}
  function clamp(value,min,max){return Math.min(max,Math.max(min,value))}
  function formatBytes(bytes){if(bytes<1024*1024)return Math.max(1,Math.round(bytes/1024))+'KB';return(bytes/1024/1024).toFixed(1)+'MB'}
  function escapeAttribute(value){return String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}

  window.openImageEditor=openImageEditor;
  window.closeImageEditor=closeImageEditor;
  window.chooseEditorImage=chooseEditorImage;
  window.loadEditorFile=loadEditorFile;
  window.restoreOriginalEditorImage=restoreOriginalEditorImage;
  window.setEditorMode=setEditorMode;
  window.autoFitEditorImage=autoFitEditorImage;
  window.resetEditorAdjustments=resetEditorAdjustments;
  window.downloadCurrentMenuPhoto=downloadCurrentMenuPhoto;
  window.downloadEditedImage=downloadEditedImage;
  window.saveEditedImageToFolder=saveEditedImageToFolder;
  window.applyOpenAIKey=applyOpenAIKey;
  window.clearOpenAIKey=clearOpenAIKey;
  window.expandEditorImageWithAI=expandEditorImageWithAI;

  install();
})();
