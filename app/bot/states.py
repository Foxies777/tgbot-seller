from aiogram.fsm.state import State, StatesGroup


class SaleFlow(StatesGroup):
    waiting_amount = State()
    waiting_action = State()
    waiting_redeem_points = State()
