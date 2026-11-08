/** 會考快速模式接入選用功能機制（H7，D75、D77⑤）：只在會考的 ② 考試名單頁下方多一塊；學測與功能關閉時不會被取出 */
import { registerFeature } from '../features';
import { QuickPanel } from '../pages/QuickPanel';

registerFeature('bcct-quick-mode', {
  stepPanels: [{ step: 2, render: (p) => <QuickPanel doc={p.doc} exam={p.exam} onChange={p.onChange} onStep={p.onStep} /> }],
});
