from datetime import datetime, timedelta, timezone

from infrastructure.config.settings import Settings


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def convert_to_utc(date_str, format="%d/%m/%Y"):
    settings = Settings()
    timezone = settings.get_timezone()
    offset_hours = timezone
    date_obj = datetime.strptime(date_str, format)

    offset = timedelta(hours=offset_hours)

    date_utc = date_obj - offset
    return date_utc


# 2024-02-07
def convert_from_utc(date_str, format="%d/%m/%Y"):
    settings = Settings()
    timezone = settings.get_timezone()
    offset_hours = timezone

    date_obj_utc = datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%S.%fZ")

    offset = timedelta(hours=offset_hours)
    date_obj_local = date_obj_utc + offset

    formatted_date = date_obj_local.strftime(format)

    return formatted_date
