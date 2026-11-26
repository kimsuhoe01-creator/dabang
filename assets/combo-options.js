// The QR catalog stores additions in CUKCUK categories. The tablet presents
// the same addition IDs as a guided choice, keeping the real category ID on
// each value so the order sent to CUKCUK still uses the original addition.
window.DABANG_COMBO_OPTIONS = (() => {
  const TYPE = {
    bone: 'f688cfab-85e2-4a3c-84ea-48cd2b56fcf7',
    boneless: '6e0215ac-2c13-4f72-9b1d-fd47691e0627',
    wings: 'a99769de-2e48-437e-814a-30c3dd3e3d59',
    jjapkoba: 'b948e319-8ef2-483c-92e9-768be31535ef'
  };
  const NORMAL = '364f50ef-8710-41ac-9e4c-73209d7a4c89 9b8f3856-60ff-4d08-b111-9e87ea20e22e 641303df-1c29-4e1d-bc2b-de7ce53a43db 28ae400d-930a-48ca-89f5-3113b1e3036e a4540023-7b3c-496b-baab-b821705d6e68 5b311b20-6191-403f-8612-08cf8648b49d 2dfd957a-1061-4e7d-a1ca-5ec27dfc1da0 b3a7e4ce-1840-4d17-9636-6e91cd32fd36 a8da2a14-4ec6-40a9-926c-9b41755b2de5 fd21b308-6f37-443b-a50c-a35c5a604106'.split(' ');
  const WINGS = 'e8e473c3-65df-4e9d-abce-0c3e480ce3e5 95da43b6-1573-4310-b70c-38090b1f2ef7 06cf5bed-c480-43a9-b157-44b4d59cf23e 74f59857-2d4f-4b98-84e1-79c75aa26a9c 21eca709-2298-47d6-be92-bb03e5461c41 22731f9b-95ae-4fc2-9dc2-bbd3ced496b7 18be4708-e8af-476b-a8f0-d575157450f0 2276ad40-3dfc-4679-a7af-df881c350153'.split(' ');
  const SOUP_SPICY = '92987c76-3de9-4491-98f9-508013c0fe9e';
  const UDON = ['d067d9f5-70b7-4a28-9b01-6914ed4f0b66', '36e1c914-9c90-4746-9c4a-cb01c6585cea'];
  const JJAPKOBA_SPICE = ['3b59138e-b848-41aa-a45d-9fa1b915fbcf', 'b4ff5c57-e25c-4275-a6a9-4a25ba70e497', '90f5ee61-9405-4725-a244-24b23222ee4f'];
  const NAMES = {
    bone: { ko: '뼈', vi: 'Có xương', zh: '带骨', en: 'Bone-in' },
    boneless: { ko: '순살', vi: 'Không xương', zh: '无骨', en: 'Boneless' },
    wings: { ko: '윙봉', vi: 'Cánh gà', zh: '鸡翅', en: 'Wings' },
    jjapkoba: { ko: '짭코바 반마리', vi: 'Nửa gà BBQ cay', zh: '半份辣味BBQ鸡', en: 'Half Spicy BBQ Chicken' }
  };
  const title = (ko, vi, zh, en) => ({ ko, vi, zh, en });
  const group = (code, role, names, values, count = 1) => ({
    id: `combo:${code}:${role}`, comboRole: role, names, values,
    required: true, minSelections: count, maxSelections: count
  });
  const kind = menu => String(menu?.cukcukCode || '').trim();
  function build(menu, sourceGroups, allTemplates) {
    const code = kind(menu);
    if (!['COMBOFAMILY599', 'COMBOCOUPLE289'].includes(code)) return null;
    const source = new Map();
    for (const template of sourceGroups) for (const value of template.values || [])
      source.set(String(value.id), { ...value, sourceTemplateId: String(template.id) });
    const betterNames = new Map();
    for (const template of allTemplates || []) for (const value of template.values || []) {
      if (!betterNames.has(String(value.id)) && value.names?.vi && value.names?.en)
        betterNames.set(String(value.id), value.names);
    }
    const take = ids => ids.map((id, index) => {
      const value = source.get(id);
      if (!value) throw new Error(`CUKCUK combo ${code} is missing addition ${id}`);
      return { ...value, names: betterNames.get(id) || value.names, sortOrder: index };
    });
    const types = (code === 'COMBOFAMILY599'
      ? ['bone', 'boneless', 'wings'] : ['bone', 'boneless', 'wings', 'jjapkoba'])
      .map((key, index) => ({ ...take([TYPE[key]])[0], names: NAMES[key], comboType: key, sortOrder: index }));
    const flavors = code === 'COMBOFAMILY599' ? 2 : 1;
    const result = [
      group(code, 'type', title('치킨 종류 선택', 'Chọn loại gà', '选择鸡肉种类', 'Choose chicken type'), types),
      group(code, 'normal', title('치킨 맛 선택', 'Chọn vị gà', '选择炸鸡口味', 'Choose chicken flavor'), take(NORMAL), flavors),
      group(code, 'wings', title('윙봉 맛 선택', 'Chọn vị cánh gà', '选择鸡翅口味', 'Choose wing flavor'), take(WINGS), flavors)
    ];
    if (code === 'COMBOFAMILY599') {
      result.push(group(code, 'soup', title('어묵탕 맛 선택', 'Chọn vị lẩu chả cá', '选择鱼饼汤口味', 'Choose fish cake soup'),
        [
          { id: 'combo-regular-soup', virtual: true, names: title('기본 어묵탕', 'Lẩu chả cá thường', '原味鱼饼汤', 'Regular fish cake soup'), additionalPrice: 0 },
          take([SOUP_SPICY])[0]
        ]));
    } else {
      result.push(group(code, 'udon', title('어묵꼬치우동 맛 선택', 'Chọn vị udon xiên chả cá', '选择鱼饼串乌冬口味', 'Choose fish cake udon'), take(UDON)));
      result.push(group(code, 'jjapkoba-spice', title('짭코바 매운 단계', 'Cấp độ cay gà BBQ', '辣味BBQ鸡辣度', 'Spicy BBQ level'), take(JJAPKOBA_SPICE)));
    }
    return result;
  }
  function active(group, groups, selections) {
    if (!group?.comboRole) return true;
    if (group.comboRole === 'type') return true;
    const typeIndex = groups.findIndex(item => item.comboRole === 'type');
    const typeId = selections[typeIndex]?.[0];
    const type = groups[typeIndex]?._values?.find(value => value.id === typeId)?.comboType;
    if (!type) return false;
    if (group.comboRole === 'normal') return type === 'bone' || type === 'boneless';
    if (group.comboRole === 'wings') return type === 'wings';
    if (group.comboRole === 'jjapkoba-spice') return type === 'jjapkoba';
    return true;
  }
  return { build, active };
})();
