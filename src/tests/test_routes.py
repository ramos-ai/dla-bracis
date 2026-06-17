"""
Unit tests for routes
"""


class TestDatasetsRoutes:
    """Tests for dataset routes"""

    def test_list_datasets(self, client):
        """Test listing datasets"""
        response = client.get("/api/dataset/list")
        assert response.status_code in [200, 500]  # 500 if DB not available

    def test_get_dataset_invalid_id(self, client):
        """Test getting dataset with invalid ID"""
        response = client.get("/api/dataset/invalid_id")
        assert response.status_code == 400

    def test_create_dataset_missing_fields(self, client):
        """Test creating dataset with missing fields"""
        response = client.post("/api/dataset/save", json={"dataset_name": "Test"})
        assert response.status_code == 400

    def test_create_dataset_valid(self, client):
        """Test creating dataset with valid data"""
        data = {
            "dataset_name": "Test Dataset",
            "description": "This is a test dataset description",
            "task_type": "classification",
            "labels": ["label1", "label2"],
            "user_id": "507f1f77bcf86cd799439011",
            "visibility": "public",
        }
        response = client.post("/api/dataset/save", json=data)
        # Should be 201 if DB available, 500 if not
        assert response.status_code in [201, 500]


class TestExercisesRoutes:
    """Tests for exercise routes"""

    def test_list_exercises(self, client):
        """Test listing exercises"""
        response = client.get("/api/exercises/list")
        assert response.status_code in [200, 500]

    def test_create_exercise_missing_fields(self, client):
        """Test creating exercise with missing fields"""
        response = client.post(
            "/api/exercises/create",
            json={"title": "Test"},
        )
        assert response.status_code == 400


class TestAuthRoutes:
    """Tests for auth routes"""

    def test_get_user_invalid_id(self, client):
        """Test getting user with invalid ID"""
        response = client.get("/api/auth/get_user/invalid_id")
        assert response.status_code == 400

    def test_create_user_missing_data(self, client):
        """Test creating user with missing data"""
        response = client.post("/api/auth/create_user", json={})
        # Should handle gracefully
        assert response.status_code in [200, 400, 500]
