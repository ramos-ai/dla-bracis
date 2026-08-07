"""
Runtime settings loaded from MongoDB (collection 'settings').
Distinct from env config: these are user/admin preferences (timezone, storage path, etc.).
"""


class Settings:
    _instance = None

    def __new__(cls, app=None, mongo=None):
        if cls._instance is None:
            cls._instance = super(Settings, cls).__new__(cls)
            cls._instance.load_settings(app, mongo)
        return cls._instance

    def load_settings(self, app, mongo):
        if app is None or mongo is None:
            self.ABSOLUTE_IMAGE_PATH = ""
            self.TIMEZONE = ""
            self.IMAGE_STORAGE_PROVIDER = ""
            return
        with app.app_context():
            settings_data = mongo.settings.find_one({})
        if settings_data:
            self.ABSOLUTE_IMAGE_PATH = settings_data.get("absolute_image_path", "")
            self.TIMEZONE = settings_data.get("timezone", "")
            self.IMAGE_STORAGE_PROVIDER = settings_data.get(
                "image_storage_provider", ""
            )
        else:
            self.ABSOLUTE_IMAGE_PATH = ""
            self.TIMEZONE = ""
            self.IMAGE_STORAGE_PROVIDER = ""

    def get_absolute_image_path(self):
        return self.ABSOLUTE_IMAGE_PATH

    def get_timezone(self):
        return self.TIMEZONE

    def get_image_storage_provider(self):
        return self.IMAGE_STORAGE_PROVIDER
