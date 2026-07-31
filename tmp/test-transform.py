import sys, os
os.chdir(r'C:\Users\vitamnb\.openclaw\workspace\trading-stack\jesse-project')
sys.path.insert(0, r'C:\Users\vitamnb\.openclaw\workspace\trading-stack\jesse')
from jesse.services.db import database
database.open_connection()
from jesse.models.BacktestSession import BacktestSession
from jesse.services.transformers import get_backtest_session

# Get the most recent finished session
sessions = BacktestSession.select().order_by(BacktestSession.created_at.desc()).limit(5)
for s in sessions:
    print(f"id={s.id} status={s.status} exc={s.exception}")
    if s.status == 'finished':
        try:
            result = get_backtest_session(s)
            print(f"  Transform OK: keys={list(result.keys())[:5]}")
        except Exception as e:
            print(f"  Transform FAILED: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
        break