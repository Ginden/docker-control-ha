# Docker Control for Home Assistant

This application allows you to monitor and control Docker containers from Home Assistant using MQTT discovery.

## Features

- **Container Discovery:** Automatically discovers running Docker containers and creates corresponding entities in Home Assistant.
- **Container Control:** Start, stop, and restart containers from the Home Assistant UI.
- **Real-time Monitoring:** Get real-time status updates for your containers, including uptime and state.
- **Daemon Information:** Exposes information about the Docker daemon itself as a device in Home Assistant.

## Screenshots

*Main device view in Home Assistant:*

![Main device view](https://via.placeholder.com/800x400.png?text=Main+Device+View)

*Container controls:*

![Container controls](https://via.placeholder.com/800x400.png?text=Container+Controls)

## Configuration

The application is configured using environment variables. Below is a list of all available options:

| Variable                  | Description                                                                 | Default                            |
| ------------------------- | --------------------------------------------------------------------------- | ---------------------------------- |
| `MQTT_HOST`               | Hostname of your MQTT broker.                                               | `localhost`                        |
| `MQTT_PORT`               | Port of your MQTT broker.                                                   | `1883`                             |
| `MQTT_USERNAME`           | Username for MQTT authentication.                                           | (none)                             |
| `MQTT_PASSWORD`           | Password for MQTT authentication.                                           | (none)                             |
| `MQTT_PROTOCOL`           | MQTT protocol to use.                                                       | `mqtt`                             |
| `MQTT_CLIENT_ID`          | Custom client ID for the MQTT connection.                                   | `ha-docker-api-{hostname}`         |
| `DOCKER_SOCKET_PATH`      | Path to the Docker socket.                                                  | (intelligent defaults)             |
| `ENABLE_CONTROL`          | Set to `true` to enable container control (start, stop, restart).           | `false`                            |
| `INCLUDE_DEAD_CONTAINERS` | Set to `true` to include dead containers in Home Assistant.                 | `false`                            |
| `HA_DEVICE_ID_PREFIX`     | Prefix for the device ID in Home Assistant.                                 | `docker_`                          |
| `UPTIME_MEASURE_TYPE`     | Format for container uptime (`seconds` or `human`).                         | `human`                            |
| `POLLING_INTERVAL`        | Time in milliseconds to poll the Docker API for changes.                    | `30000`                            |
| `LOG_LEVEL`               | Log level for the application.                                              | `info`                             |
| `EXPOSE_DAEMON_INFO`      | Set to `true` to expose Docker daemon information as a device.              | `false`                            |
| `DAEMON_CONTROLLER_NAME`  | Name for the Docker daemon device in Home Assistant.                        | `Docker Daemon on {hostname}`      |

## Docker Compose Example

Here is a sample `docker-compose.yml` file to run the application:

```yaml
services:
  docker-control-ha:
    image: ghcr.io/ginden/docker-control-ha
    container_name: docker-control-ha
    restart: unless-stopped
    environment:
      MQTT_HOST: localhost
      MQTT_PORT: 1883
      # MQTT_USERNAME: user
      # MQTT_PASSWORD: password
      DOCKER_SOCKET_PATH: /var/run/docker.sock
      ENABLE_CONTROL: "true"
      LOG_LEVEL: info
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

## Running the Application

1.  Create a `docker-compose.yml` file based on the example above.
2.  Customize the environment variables to match your setup.
3.  Run `docker-compose up -d` to start the application in the background.

## Exposed Entities

This application will create the following entities in Home Assistant:

### Container Entities

For each discovered Docker container, a new device is created with the following entities:

- **Binary Sensor:**
  - `Running`: Indicates if the container is currently running.
- **Sensors:**
  - `Uptime`: Shows the container's uptime (either in seconds or a human-readable format).
  - `Health`: Displays the container's health status (e.g., `healthy`, `unhealthy`).
  - `Image`: The base name of the Docker image.
- **Buttons (if `ENABLE_CONTROL` is `true`):**
  - `Restart`: Restarts the container.
  - `Kill`: Forcibly stops the container.
  - `Stop`: Gracefully stops the container.

### Daemon Entities

If `EXPOSE_DAEMON_INFO` is set to `true`, a device is created for the Docker daemon with the following entities:

- **Sensors:**
  - `Unhealthy Containers`: The number of containers with an `unhealthy` status.
  - `Running Containers`: The number of currently running containers.
  - `Paused Containers`: The number of paused containers.
  - `Stopped Containers`: The number of stopped containers.

## TODO

- [ ] Add support for more container actions (e.g., pause, unpause, kill).
- [ ] Expose more container details as sensors (e.g., CPU usage, memory usage, network stats).
- [ ] Allow filtering of containers to be exposed to Home Assistant (e.g., by label or name).
- [ ] Create a Home Assistant add-on for easier installation.
- [ ] Add more comprehensive tests.

## Development

To run the application in a development environment:

1.  Clone the repository.
2.  Install dependencies with `npm install`.
3.  Run the application with `npm start`.
