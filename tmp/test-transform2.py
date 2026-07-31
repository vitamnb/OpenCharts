import sys, os
os.chdir(r'C:\Users\vitamnb\.openclaw\workspace\trading-stack\jesse-project')
sys.path.insert(0, r'C:\Users\vitamnb\.openclaw\workspace\trading-stack\jesse')
from jesse.services.db import database
database.open_connection()
from jesse.models.BacktestSession import BacktestSession
from jesse.services.transformers import get_backtest_session_for_load_more

sessions = BacktestSession.select().order_by(BacktestSession.created_at.desc()).limit(5)
for s in sessions:
    print(f"id={s.id} status={s.status}")
    if s.status == 'finished':
        try:
            result = get_backtest_session_for_load_more(s)
            print(f"  Transform OK: keys={list(result.keys())[:8]}")
            print(f"  metrics type: {type(result.get('metrics'))}")
            print(f"  trades count: {len(result.get('trades', []))}")
            print(f"  equity_curve len: {len(result.get('equity_curve', []))}")
        except Exception as e:
            print(f"  Transform FAILED: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
        break