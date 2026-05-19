FROM python:3.13-slim AS base

########################
# Install Dependencies #
########################

# Copy requirements.txt to container
COPY ./backend/requirements.txt /tmp/requirements.txt

# Upgrade pip and install Python requirements
RUN pip3 install --upgrade pip ; \
    pip3 install --no-cache -r /tmp/requirements.txt


###########
# Workdir #
###########

# Set workdir to app
WORKDIR /usr/src/app
ENV PYTHONPATH "${PYTHONPATH}:/usr/src/app"


##############################
# Define Default Dev Command #
##############################

CMD ["uvicorn", "main:app", "--reload", "--host", "0.0.0.0", "--port", "8080"]


FROM base AS production

#############
# Copy Data #
#############

# Copy app to container
COPY ./backend/src /usr/src/app
COPY ./backend/assets /usr/src/app/assets
COPY ./mockup/data_sources /usr/src/data_sources


##########
# Verify #
##########

# Check content of app folder
RUN ls -la /usr/src/app


#####################################
# Define Default Production Command #
#####################################

# Start FastAPI server with Uvicorn in production mode.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
