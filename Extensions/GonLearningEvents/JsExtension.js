//@ts-check
/// <reference path="../JsExtensionTypes.d.ts" />
/**
 * GonLearningEvents — extension chính thức của GON (Góa học mở) cho GDevelop 5.
 *
 * Gửi sự kiện học phát sinh TRONG game lên backend GON qua bridge của launcher
 * (window.__gonSendEvent trong public/game-launch.html — same-origin, CSRF).
 * Hợp đồng event: batch gon.game-events/1.0
 * (POST /v1/game-sessions/{id}/events — xem docs/04-contracts).
 *
 * Runtime: gonlearningevents.ts (namespace gdjs.evtTools.gonLearningEvents).
 * Apply-5 tạo runtime; Apply-7 (27/10) bổ sung declaration chuẩn GDevelop
 * (JsExtension.js) để extension được GDevelop editor nhận diện.
 *
 * More information on https://github.com/4ian/GDevelop/blob/master/newIDE/README-extensions.md
 */

/** @type {ExtensionModule} */
module.exports = {
  createExtension: function (_, gd) {
    const extension = new gd.PlatformExtension();
    extension
      .setExtensionInformation(
        'GonLearningEvents',
        _('GON Learning Events'),
        _(
          'Gửi sự kiện học (objective_viewed, checkpoint_reached, session_completed…) từ game GDevelop lên phiên học GON qua gon.game-events/1.0.'
        ),
        'GON project',
        'Open source (MIT License)'
      )
      .setShortDescription(
        'Gắn bằng chứng học vào game: mỗi hành động của người chơi trong game trở thành một game event trên /v1.'
      )
      .setExtensionHelpPath('/all-features/gon-learning-events')
      .setCategory('Learning');

    extension
      .addInstructionOrExpressionGroupMetadata(_('GON Learning Events'))
      .setIcon('JsPlatform/Extensions/tween_behavior32.png');

    extension
      .addAction(
        'SendGameEvent',
        _('Send GON game event'),
        _(
          'Gửi một game event (gon.game-events/1.0) lên phiên học GON đang chạy. EventType: session_started, objective_viewed, action_performed, checkpoint_reached, question_answered, session_completed, session_abandoned.'
        ),
        _('Send GON event _PARAM1_ with data (JSON) _PARAM2_'),
        '',
        'JsPlatform/Extensions/tween_behavior32.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('stringWithSelector', _('Event type'), '["session_started","objective_viewed","action_performed","checkpoint_reached","question_answered","session_completed","session_abandoned"]', false)
      .addParameter('string', _('Data (JSON object, e.g. {"nodeId":"node_1"})'), '{"source":"gdevelop_editor"}', false)
      .getCodeExtraInformation()
      .setIncludeFile('Extensions/GonLearningEvents/gonlearningevents.js')
      .setFunctionName('gdjs.evtTools.gonLearningEvents.sendGameEvent');

    extension
      .addAction(
        'SendObjectiveViewed',
        _('Mark objective as viewed (GON)'),
        _(
          'Gửi event objective_viewed cho một node học — dùng khi người chơi mở/đọc xong node đó.'
        ),
        _('Mark GON objective _PARAM1_ as viewed'),
        '',
        'JsPlatform/Extensions/tween_behavior32.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('string', _('Node id'), '', false)
      .addParameter('string', _('Node title (optional)'), '""', true)
      .getCodeExtraInformation()
      .setIncludeFile('Extensions/GonLearningEvents/gonlearningevents.js')
      .setFunctionName('gdjs.evtTools.gonLearningEvents.sendObjectiveViewed');

    extension
      .addCondition(
        'PointIsOnObject',
        _('Point is on object (GON)'),
        _(
          'Kiểm tra một điểm (theo tọa độ scene) có nằm trên AABB của object hay không — dùng cho "chạm vào node".'
        ),
        _('_PARAM1_ is on object _PARAM2_'),
        '',
        'JsPlatform/Extensions/tween_behavior32.png',
        'JsPlatform/Extensions/tween_behavior32.png'
      )
      .addParameter('expression', _('Point X'), '', false)
      .addParameter('expression', _('Point Y'), '', false)
      .addParameter('objectList', _('Object'), '', false)
      .getCodeExtraInformation()
      .setIncludeFile('Extensions/GonLearningEvents/gonlearningevents.js')
      .setFunctionName('gdjs.evtTools.gonLearningEvents.pointIsOnObjectCondition');

    return extension;
  },
  runExtensionSanityTests: function (gd, extension) {
    return [];
  },
};
