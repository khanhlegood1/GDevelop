// GonLearningEvents — runtime extension thật của GON cho GDevelop/GDJS (MIT).
//
// Apply-5 (27/10): cho phép event học phát sinh NGAY TRONG game (objective_viewed
// khi người học chạm vào node, checkpoint_reached khi xem đủ) và gửi về
// POST /v1/game-sessions/{id}/events qua bridge `window.__gonSendEvent` của
// launcher same-origin (public/game-launch.html làm transport: CSRF + cookie).
//
// Format theo pattern runtime extension chính thức của GDevelop
// (xem Extensions/Leaderboards/leaderboardstools.ts): namespace gdjs.evtTools,
// file được serve theo manifest thứ tự của GDJS và scene code generated
// (gdjs.MainSceneCode) gọi các hàm này mỗi frame.
namespace gdjs {
  export namespace evtTools {
    export namespace gonLearningEvents {
      const logger = new gdjs.Logger('GonLearningEvents');

      /**
       * Gửi một game event lên /v1 qua bridge của launcher.
       * @param eventType Một trong 7 eventType của gon.game-events/1.0.
       * @param dataJson Chuỗi JSON object dữ liệu sự kiện.
       * @returns true nếu bridge đã nhận (không chờ mạng — không chặn game loop).
       */
      export const sendGameEvent = (eventType: string, dataJson: string): boolean => {
        try {
          const bridge = (window as unknown as {
            __gonSendEvent?: (eventType: string, data: Record<string, unknown>) => void;
          }).__gonSendEvent;
          if (!bridge) {
            logger.error('Launcher bridge __gonSendEvent chưa sẵn sàng — bỏ qua event ' + eventType);
            return false;
          }
          let data: Record<string, unknown> = {};
          if (dataJson && dataJson.length > 0) {
            const parsed = JSON.parse(dataJson);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
          }
          bridge(eventType, data);
          return true;
        } catch (error) {
          logger.error('Gửi event thất bại (' + eventType + '): ' + error);
          return false;
        }
      };

      /**
       * Tiện ích cho editor: gửi objective_viewed cho một node học.
       * @param nodeId Id node trong Module Graph của GON.
       * @param title (tuỳ chọn) Tiêu đề hiển thị của node.
       */
      export const sendObjectiveViewed = (nodeId: string, title?: string): boolean =>
        sendGameEvent(
          'objective_viewed',
          JSON.stringify({ nodeId: nodeId, ...(title ? { title: title } : {}), source: 'gdevelop_editor' })
        );

      /**
       * Kiểm tra một điểm (chuột, tọa độ scene) nằm trong AABB của object.
       * Dùng cho điều kiện "chạm vào node" của scene code.
       */
      export const pointIsOnObject = (
        object: { getAABB: () => { min: Array<number>; max: Array<number> } },
        x: number,
        y: number
      ): boolean => {
        const box = object.getAABB();
        if (!box || !box.min || !box.max) return false;
        return x >= box.min[0] && x <= box.max[0] && y >= box.min[1] && y <= box.max[1];
      };

      /**
       * Condition cho GDevelop editor: điểm (x, y) có nằm trên bất kỳ object nào
       * trong danh sách không. Chấp nhận cả gọi trực tiếp (object đơn) như scene
       * code generated của GON vẫn dùng.
       */
      export const pointIsOnObjectCondition = (
        objectsListsOrObject: unknown,
        x: number,
        y: number
      ): boolean => {
        // Gọi trực tiếp với một object (scene code generated của GON).
        if (
          objectsListsOrObject &&
          typeof objectsListsOrObject === 'object' &&
          typeof (objectsListsOrObject as { getAABB?: unknown }).getAABB === 'function'
        ) {
          return pointIsOnObject(objectsListsOrObject as { getAABB: () => { min: Array<number>; max: Array<number> } }, x, y);
        }
        // Gọi từ events GDevelop: objectsLists = hashtable tên -> danh sách object.
        const lists = objectsListsOrObject as Record<string, Array<{ getAABB: () => { min: Array<number>; max: Array<number> } }>> | null | undefined;
        if (!lists || typeof lists !== 'object') return false;
        for (const listName of Object.keys(lists)) {
          const list = lists[listName];
          if (!Array.isArray(list)) continue;
          for (const object of list) {
            if (pointIsOnObject(object, x, y)) return true;
          }
        }
        return false;
      };
    }
  }
}
