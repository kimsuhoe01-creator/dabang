(function(root){
  const codes=['COMBOFAMILY599','COMBOCOUPLE289'];
  const copy={
    ko:{nav:'🎄 연말 할인',kicker:'DABANG HOLIDAY SPECIAL',title:'올해의 마지막, 같이 먹을수록 더 즐겁게',description:'12월 31일까지 · 패밀리 & 커플 콤보 연말 특가',tag:'연말 한정 혜택',saving:'할인',action:'세트 담기'},
    vi:{nav:'🎄 Ưu đãi cuối năm',kicker:'DABANG HOLIDAY SPECIAL',title:'Cuối năm sum vầy, cùng nhau ăn ngon',description:'Đến hết 31/12 · Ưu đãi combo gia đình & cặp đôi',tag:'Ưu đãi cuối năm',saving:'Giảm',action:'Chọn combo'},
    zh:{nav:'🎄 年末优惠',kicker:'DABANG HOLIDAY SPECIAL',title:'年末相聚，美味一起分享',description:'截至12月31日 · 家庭与双人套餐年末特惠',tag:'年末限定优惠',saving:'优惠',action:'选择套餐'},
    en:{nav:'🎄 Year-end deals',kicker:'DABANG HOLIDAY SPECIAL',title:'Celebrate together over good food',description:'Through Dec 31 · Family & couple combo specials',tag:'Year-end special',saving:'Save',action:'Choose combo'}
  };
  function activeAt(now=new Date()){
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(part=>[part.type,part.value]));
    const day=`${parts.year}-${parts.month}-${parts.day}`;
    return day>='2026-11-26'&&day<='2026-12-31';
  }
  root.DABANG_YEAR_END={codes,copy,activeAt};
})(typeof window==='undefined'?globalThis:window);
